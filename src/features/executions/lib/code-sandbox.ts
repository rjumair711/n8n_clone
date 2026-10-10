import { shouldInterruptAfterDeadline } from "quickjs-emscripten";
import { newSandboxEngine } from "./sandbox-engine";
import {
  CODE_TIMEOUT_DEFAULT_SECONDS,
  SANDBOX_MAX_LOG_CHARS,
  SANDBOX_MAX_LOG_LINES,
  applySandboxLimits,
  describeSandboxError,
  getSandboxMaxOutputChars,
  sandboxOutputMessage,
} from "./sandbox-limits";

export type SandboxResult =
  | { success: true; data: unknown; logs: string[] }
  | { success: false; error: string; logs: string[] };

export type SandboxOptions = {
  // How long the script may run. The Code node's setting, 10 seconds if unset
  timeoutMs?: number;
  // The most characters the JSON of the result may have
  maxOutputChars?: number;
};

const formatLogArgs = (args: unknown[]) =>
  args
    .map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg)))
    .join(" ");

/**
 * Runs user code inside QuickJS compiled to WebAssembly. The script gets its
 * own JavaScript engine with no access to Node (`process`, `require`, the
 * filesystem, the network), unlike Node's `vm` module which is not a
 * security boundary. Only `context` (a JSON copy) and `console` are exposed.
 *
 * The engine is limited in memory, stack depth, running time and in how
 * much it may hand back (see sandbox-limits.ts). Going over a limit is an
 * ordinary failed result, never an exception.
 */
export const runInSandbox = async (
  code: string,
  context: unknown,
  onLog?: (type: "LOG" | "ERROR", message: string) => void,
  options: SandboxOptions = {}
): Promise<SandboxResult> => {
  const logs: string[] = [];
  let droppedLogs = 0;

  const timeoutMs = options.timeoutMs ?? CODE_TIMEOUT_DEFAULT_SECONDS * 1000;
  const maxOutputChars = options.maxOutputChars ?? getSandboxMaxOutputChars();

  // An engine of its own for every run: its memory cannot grow past the
  // limit, and all of it is given back when the run is over
  const engine = await newSandboxEngine();

  // An error the script threw is passed on as it is; a limit says so
  const fail = (error: unknown): SandboxResult => {
    const { detail, limit } = describeSandboxError(
      error,
      timeoutMs,
      engine.isMemoryFull()
    );

    return {
      success: false,
      error: limit ? `Script stopped: ${detail}` : detail,
      logs,
    };
  };

  const runtime = engine.quickjs.newRuntime();

  applySandboxLimits(runtime);
  // Stops synchronous runaway code such as `while (true) {}`. One deadline
  // for the whole run: the script and the promise jobs it leaves behind.
  runtime.setInterruptHandler(
    shouldInterruptAfterDeadline(Date.now() + timeoutMs)
  );

  const vm = runtime.newContext();

  try {
    // console.log / console.error
    const consoleHandle = vm.newObject();
    for (const [name, type] of [
      ["log", "LOG"],
      ["error", "ERROR"],
    ] as const) {
      const fnHandle = vm.newFunction(name, (...args) => {
        // A script in a loop must not fill the server's memory with logs
        if (logs.length >= SANDBOX_MAX_LOG_LINES) {
          droppedLogs += 1;
          return;
        }

        let message = formatLogArgs(args.map((arg) => vm.dump(arg)));
        if (message.length > SANDBOX_MAX_LOG_CHARS) {
          message = `${message.slice(0, SANDBOX_MAX_LOG_CHARS)}... (cut, ${message.length} characters)`;
        }

        logs.push(`[${type}] ${message}`);
        onLog?.(type, message);
      });
      vm.setProp(consoleHandle, name, fnHandle);
      fnHandle.dispose();
    }
    vm.setProp(vm.global, "console", consoleHandle);
    consoleHandle.dispose();

    // The context crosses the boundary as a JSON string, never as a live object
    const contextJson = vm.newString(JSON.stringify(context ?? {}));
    vm.setProp(vm.global, "__contextJson", contextJson);
    contextJson.dispose();

    const evaluated = vm.evalCode(
      `const context = JSON.parse(__contextJson);
delete globalThis.__contextJson;
(async () => { ${code}
})().then((value) => JSON.stringify(value === undefined ? null : value));`,
      "sandbox-workflow-user-code.js"
    );

    if (evaluated.error) {
      const error = vm.dump(evaluated.error);
      evaluated.error.dispose();
      return fail(error);
    }

    const promiseHandle = evaluated.value;
    const settled = vm.resolvePromise(promiseHandle);
    promiseHandle.dispose();

    // Drive the promise job queue; the interrupt handler bounds each job
    const jobs = runtime.executePendingJobs();
    if (jobs.error) {
      const error = vm.dump(jobs.error);
      jobs.error.dispose();
      return fail(error);
    }

    // Nothing inside the sandbox can resolve the promise later (no timers,
    // no I/O), so a promise that is still pending will never settle.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const result = await Promise.race([
      settled,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), 50);
      }),
    ]);
    clearTimeout(timer);

    if (result === null) {
      return {
        success: false,
        error: "Script returned a promise that never resolves",
        logs,
      };
    }

    if (result.error) {
      const error = vm.dump(result.error);
      result.error.dispose();
      return fail(error);
    }

    // Measured while the text is still inside the sandbox: a result that is
    // too large is never copied out
    const lengthHandle = vm.getProp(result.value, "length");
    const length = vm.getNumber(lengthHandle);
    lengthHandle.dispose();

    if (length > maxOutputChars) {
      result.value.dispose();
      return {
        success: false,
        error: `Script stopped: ${sandboxOutputMessage(length, maxOutputChars)}`,
        logs,
      };
    }

    const json = vm.dump(result.value) as string;
    result.value.dispose();

    if (droppedLogs > 0) {
      logs.push(`[LOG] ${droppedLogs} more log lines were not kept (the limit is ${SANDBOX_MAX_LOG_LINES})`);
    }

    return { success: true, data: JSON.parse(json), logs };
  } catch (error) {
    // The engine itself gave up, which is what running out of memory can
    // look like from outside
    return fail(error);
  } finally {
    try {
      vm.dispose();
      runtime.dispose();
    } catch {
      // A run that hit its limits can leave the engine unable to tidy up.
      // The runtime is dropped either way.
    }
  }
};
