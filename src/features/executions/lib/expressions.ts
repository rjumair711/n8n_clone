import { shouldInterruptAfterDeadline } from "quickjs-emscripten";
import type { WorkflowContext } from "../types";
import { newSandboxEngine, type SandboxEngine } from "./sandbox-engine";
import {
  EXPRESSION_TIMEOUT_MS,
  applySandboxLimits,
  describeSandboxError,
  getSandboxMaxOutputChars,
  sandboxOutputMessage,
} from "./sandbox-limits";

// n8n-style expressions: {{ $json.user.name }}, {{ $('myApiCall').item.json.id }},
// {{ $json.total * 1.2 }}, {{ $now }}. They are JavaScript, so they run in
// the same QuickJS sandbox as the Code node: no access to Node, the network
// or the filesystem.
//
// RXJ keeps one shared set of variables per run instead of n8n's item lists,
// so `$json` is that whole set: {{ $json.webhook.body.name }} is the same
// value as {{webhook.body.name}}.

// Rendering is synchronous and an engine can only be made asynchronously,
// so expressions share one engine (each render still gets a runtime of its
// own inside it). Its memory has the same maximum as a Code node's.
let engine: SandboxEngine | undefined;
let loading: Promise<void> | undefined;

/**
 * Loads the sandbox. Rendering is synchronous, so this has to have finished
 * before the first expression is evaluated; the engine awaits it when a run
 * starts.
 */
export const ensureExpressionEngine = (): Promise<void> => {
  loading ??= newSandboxEngine().then((created) => {
    engine = created;
  });

  return loading;
};

// A runtime that could not be disposed of keeps its memory inside the
// engine for good. The engine is replaced by a fresh one; renders go on
// using the old one until the new one is ready.
const replaceExpressionEngine = () => {
  loading = newSandboxEngine().then(
    (created) => {
      engine = created;
    },
    (error) => {
      console.error("Could not replace the expression engine:", error);
    }
  );
};

// $json, $input, $node, $now, $today, $execution, $workflow, $('name') and
// $fromAI('key'). The Handlebars helper form {{$fromAI "key"}} has no "(".
const N8N_EXPRESSION =
  /(^|[^\w$.])\$(json|input|node|now|today|execution|workflow|itemIndex)\b|(^|[^\w$.])\$\(|\$fromAI\s*\(/;

export const isN8nExpression = (expression: string) =>
  N8N_EXPRESSION.test(expression);

export class ExpressionError extends Error {
  constructor(expression: string, detail: string) {
    super(`Expression {{ ${expression.trim()} }} failed: ${detail}`);
    this.name = "ExpressionError";
  }
}

// Runs once per render; every expression of the template shares it
const PRELUDE = `
const __ctx = JSON.parse(__contextJson);
delete globalThis.__contextJson;

const __ref = (name) => {
  const json = __ctx[name];
  const item = { json };
  const items = json && Array.isArray(json.items)
    ? json.items.map((entry) => ({ json: entry }))
    : [item];
  return {
    item, json, params: {},
    isExecuted: json !== undefined,
    first: () => items[0],
    last: () => items[items.length - 1],
    all: () => items,
  };
};

const __date = (date) => {
  date.toISO = () => date.toISOString();
  date.toMillis = () => date.getTime();
  date.toString = () => date.toISOString();
  return date;
};

// While a node runs for one item of a list, $json is that item (n8n's
// meaning) with the workflow's other variables still reachable through it
const __hasItem = Object.prototype.hasOwnProperty.call(__ctx, "item") &&
  Object.prototype.hasOwnProperty.call(__ctx, "itemIndex");
const __item = __hasItem ? __ctx.item : __ctx;
const $json = __hasItem && __item !== null && typeof __item === "object" && !Array.isArray(__item)
  ? { ...__ctx, ...__item }
  : __hasItem ? __item : __ctx;
const $itemIndex = __hasItem ? __ctx.itemIndex : 0;
const __inputItems = Array.isArray(__ctx.items)
  ? __ctx.items.map((json) => ({ json }))
  : [{ json: __item }];
const $input = {
  item: { json: __item }, params: {},
  first: () => __inputItems[0],
  last: () => __inputItems[__inputItems.length - 1],
  all: () => __inputItems,
};
const $ = __ref;
const $node = new Proxy({}, { get: (_target, name) => __ref(String(name)) });
const $now = __date(new Date());
const $today = __date(new Date(new Date().setUTCHours(0, 0, 0, 0)));
const $execution = __ctx.execution ?? {};
const $workflow = __ctx.workflow ?? {};
const $fromAI = (key) => {
  const value = (__ctx.ai ?? {})[key];
  return value === undefined || value === null ? "" : value;
};

const __format = (value) => {
  if (value === undefined || value === null) return "";
  if (value instanceof Date) return value.toISOString();
  return typeof value === "object" ? JSON.stringify(value) : String(value);
};
`;

/**
 * Evaluates the given expressions against the workflow data and returns
 * their results as text (objects and lists as JSON, missing values as "").
 */
export const evaluateExpressions = (
  expressions: string[],
  context: WorkflowContext
): string[] => {
  if (expressions.length === 0) return [];

  if (!engine) {
    // Starts loading so a retry succeeds
    void ensureExpressionEngine();

    throw new Error(
      "The expression engine is still starting. Run the workflow again."
    );
  }

  const maxOutputChars = getSandboxMaxOutputChars();
  const { quickjs, isMemoryFull } = engine;

  const runtime = quickjs.newRuntime();
  applySandboxLimits(runtime);
  // Reading the workflow data into the sandbox is bounded too
  runtime.setInterruptHandler(
    shouldInterruptAfterDeadline(Date.now() + EXPRESSION_TIMEOUT_MS)
  );

  const vm = runtime.newContext();

  try {
    const contextJson = vm.newString(JSON.stringify(context ?? {}));
    vm.setProp(vm.global, "__contextJson", contextJson);
    contextJson.dispose();

    const prelude = vm.evalCode(PRELUDE, "expression-prelude.js");
    if (prelude.error) {
      const error = vm.dump(prelude.error);
      prelude.error.dispose();
      throw new Error(
        `Expressions could not read the workflow data: ${describeSandboxError(error, EXPRESSION_TIMEOUT_MS, isMemoryFull()).detail}`
      );
    }
    prelude.value.dispose();

    return expressions.map((expression) => {
      // Each expression gets its own time budget
      runtime.setInterruptHandler(
        shouldInterruptAfterDeadline(Date.now() + EXPRESSION_TIMEOUT_MS)
      );

      let result: ReturnType<typeof vm.evalCode>;

      try {
        result = vm.evalCode(
          `__format((\n${expression}\n))`,
          "expression.js"
        );
      } catch (error) {
        // The engine itself gave up (see describeSandboxError)
        throw new ExpressionError(
          expression,
          describeSandboxError(error, EXPRESSION_TIMEOUT_MS, isMemoryFull()).detail
        );
      }

      if (result.error) {
        const error = vm.dump(result.error);
        result.error.dispose();

        // An error object's message, as before; a limit in plain words
        const failure = describeSandboxError(error, EXPRESSION_TIMEOUT_MS, isMemoryFull());

        throw new ExpressionError(
          expression,
          failure.limit ? failure.detail : error?.message || failure.detail
        );
      }

      // Measured inside the sandbox: a result that is too large is never
      // copied out
      const lengthHandle = vm.getProp(result.value, "length");
      const length = vm.getNumber(lengthHandle);
      lengthHandle.dispose();

      if (length > maxOutputChars) {
        result.value.dispose();
        throw new ExpressionError(expression, sandboxOutputMessage(length, maxOutputChars));
      }

      const text = vm.dump(result.value) as string;
      result.value.dispose();

      return text;
    });
  } finally {
    try {
      vm.dispose();
      runtime.dispose();
    } catch {
      // A run that overflowed the stack inside a built-in cannot be tidied
      // up: its memory stays in this engine, so a new engine takes over
      replaceExpressionEngine();
    }
  }
};
