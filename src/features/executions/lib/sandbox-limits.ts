import type { QuickJSRuntime } from "quickjs-emscripten";

// The limits every QuickJS runtime gets, for the Code node and for
// expressions. Each run has a runtime of its own, so they are per run.

export const SANDBOX_MEMORY_LIMIT_MB = 64;
// About 700 nested function calls. QuickJS runs on the server's own call
// stack, so its limit has to be reached well before that one is: with the
// 512 KB used before, the server's stack ran out first and the limit never
// applied.
export const SANDBOX_MAX_STACK_KB = 128;

// How long a Code node may run: the default, and the most a node can ask for
export const CODE_TIMEOUT_DEFAULT_SECONDS = 10;
export const CODE_TIMEOUT_MAX_SECONDS = 60;

// One {{ }} expression
export const EXPRESSION_TIMEOUT_MS = 1000;

const positiveNumber = (value: unknown) => {
  const number = typeof value === "string" && value.trim() ? Number(value) : value;

  return typeof number === "number" && Number.isFinite(number) && number > 0
    ? number
    : null;
};

/**
 * The most text that may come back from the sandbox in one go, in
 * characters: the JSON of a Code node's result, or one expression's result.
 * SANDBOX_MAX_OUTPUT_KB changes it, 1024 (1 MB) by default.
 */
export const getSandboxMaxOutputChars = (
  env: Record<string, string | undefined> = process.env
) => Math.floor((positiveNumber(env.SANDBOX_MAX_OUTPUT_KB) ?? 1024) * 1024);

// console.log from a Code node: what one line and one run may hold
export const SANDBOX_MAX_LOG_CHARS = 10_000;
export const SANDBOX_MAX_LOG_LINES = 200;

/**
 * The Code node's "Timeout (seconds)" setting as a number from 1 to
 * CODE_TIMEOUT_MAX_SECONDS. Nodes saved before the setting existed, and
 * anything that is not a number, get the default.
 */
export const resolveCodeTimeoutSeconds = (value: unknown): number => {
  const seconds = positiveNumber(value);
  if (seconds === null) return CODE_TIMEOUT_DEFAULT_SECONDS;

  return Math.min(Math.max(seconds, 1), CODE_TIMEOUT_MAX_SECONDS);
};

export const applySandboxLimits = (runtime: QuickJSRuntime) => {
  // Refuses one allocation larger than the limit straight away. What adds
  // up over many allocations is held back by the engine's own memory
  // maximum (see sandbox-engine.ts).
  runtime.setMemoryLimit(SANDBOX_MEMORY_LIMIT_MB * 1024 * 1024);
  runtime.setMaxStackSize(SANDBOX_MAX_STACK_KB * 1024);
};

const formatDuration = (ms: number) =>
  ms >= 1000 && ms % 1000 === 0
    ? `${ms / 1000} second${ms === 1000 ? "" : "s"}`
    : `${ms}ms`;

const formatSize = (chars: number) =>
  chars >= 1024 * 1024
    ? `${Math.round((chars / 1024 / 1024) * 10) / 10} MB`
    : `${Math.max(Math.round(chars / 1024), 1)} KB`;

export const sandboxTimeoutMessage = (timeoutMs: number) =>
  `it ran for more than ${formatDuration(timeoutMs)}`;

export const sandboxMemoryMessage = () =>
  `it used more than the ${SANDBOX_MEMORY_LIMIT_MB} MB of memory a script may use`;

export const sandboxOutputMessage = (chars: number, limit: number) =>
  `its result is too large (${formatSize(chars)}, the limit is ${formatSize(limit)})`;

export type SandboxFailure = {
  // What happened, starting with "it" when a limit was hit ("it ran for
  // more than 10 seconds...") so the caller can name what "it" is
  detail: string;
  // True when one of the sandbox limits stopped the code, false for an
  // ordinary error thrown by it
  limit: boolean;
};

const hitLimit = (detail: string): SandboxFailure => ({ detail, limit: true });

/**
 * Says what went wrong in words a workflow author can act on. QuickJS
 * reports a timeout as "interrupted" and its own limits as "out of memory"
 * and "stack overflow". A few built-ins (JSON.stringify of something nested
 * tens of thousands deep) recurse without asking QuickJS, and end as the
 * server's "Maximum call stack size exceeded" instead.
 */
export const describeSandboxError = (
  error: unknown,
  timeoutMs: number,
  // From the engine: its memory is at its maximum
  memoryFull = false
): SandboxFailure => {
  // Either `throw null` / `throw undefined`, or QuickJS was so short of
  // memory that it could not build an error to report
  if (error === null || error === undefined) {
    return memoryFull
      ? hitLimit(sandboxMemoryMessage())
      : { detail: `the code threw ${error}`, limit: false };
  }

  const { name, message } =
    typeof error === "object"
      ? (error as { name?: string; message?: string })
      : { name: undefined, message: String(error) };

  if (message === "interrupted") return hitLimit(sandboxTimeoutMessage(timeoutMs));
  if (message && /out of memory/i.test(message)) return hitLimit(sandboxMemoryMessage());
  if (message && /stack overflow|maximum call stack size exceeded/i.test(message)) {
    return hitLimit(
      "it nested calls or data too deeply (stack overflow), usually a function that calls itself without end"
    );
  }

  const detail = message ? (name ? `${name}: ${message}` : message) : String(error);

  return { detail, limit: false };
};
