import {
  getQuickJS,
  shouldInterruptAfterDeadline,
} from "quickjs-emscripten";

const TIMEOUT_MS = 4000;
const MEMORY_LIMIT_BYTES = 32 * 1024 * 1024;
const MAX_STACK_BYTES = 512 * 1024;

export type SandboxResult =
  | { success: true; data: unknown; logs: string[] }
  | { success: false; error: string; logs: string[] };

const formatLogArgs = (args: unknown[]) =>
  args
    .map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg)))
    .join(" ");

/**
 * Runs user code inside QuickJS compiled to WebAssembly. The script gets its
 * own JavaScript engine with no access to Node (`process`, `require`, the
 * filesystem, the network), unlike Node's `vm` module which is not a
 * security boundary. Only `context` (a JSON copy) and `console` are exposed.
 */
export const runInSandbox = async (
  code: string,
  context: unknown,
  onLog?: (type: "LOG" | "ERROR", message: string) => void
): Promise<SandboxResult> => {
  const logs: string[] = [];

  const QuickJS = await getQuickJS();
  const runtime = QuickJS.newRuntime();

  runtime.setMemoryLimit(MEMORY_LIMIT_BYTES);
  runtime.setMaxStackSize(MAX_STACK_BYTES);
  // Stops synchronous runaway code such as `while (true) {}`
  runtime.setInterruptHandler(
    shouldInterruptAfterDeadline(Date.now() + TIMEOUT_MS)
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
        const message = formatLogArgs(args.map((arg) => vm.dump(arg)));
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
      return { success: false, error: describeError(error), logs };
    }

    const promiseHandle = evaluated.value;
    const settled = vm.resolvePromise(promiseHandle);
    promiseHandle.dispose();

    // Drive the promise job queue; the interrupt handler bounds each job
    const jobs = runtime.executePendingJobs();
    if (jobs.error) {
      const error = vm.dump(jobs.error);
      jobs.error.dispose();
      return { success: false, error: describeError(error), logs };
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
      return { success: false, error: describeError(error), logs };
    }

    const json = vm.dump(result.value) as string;
    result.value.dispose();

    return { success: true, data: JSON.parse(json), logs };
  } finally {
    vm.dispose();
    runtime.dispose();
  }
};

const describeError = (error: unknown): string => {
  if (error && typeof error === "object") {
    const { name, message } = error as { name?: string; message?: string };

    if (message === "interrupted") {
      return `Script execution timed out (${TIMEOUT_MS}ms limit exceeded)`;
    }

    if (message) return name ? `${name}: ${message}` : message;
  }

  return String(error);
};
