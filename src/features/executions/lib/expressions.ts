import {
  getQuickJS,
  shouldInterruptAfterDeadline,
  type QuickJSWASMModule,
} from "quickjs-emscripten";
import type { WorkflowContext } from "../types";

// n8n-style expressions: {{ $json.user.name }}, {{ $('myApiCall').item.json.id }},
// {{ $json.total * 1.2 }}, {{ $now }}. They are JavaScript, so they run in
// the same QuickJS sandbox as the Code node: no access to Node, the network
// or the filesystem.
//
// RXJ keeps one shared set of variables per run instead of n8n's item lists,
// so `$json` is that whole set: {{ $json.webhook.body.name }} is the same
// value as {{webhook.body.name}}.

const TIMEOUT_MS = 250;
const MEMORY_LIMIT_BYTES = 32 * 1024 * 1024;
const MAX_STACK_BYTES = 512 * 1024;

let quickjs: QuickJSWASMModule | undefined;
let loading: Promise<void> | undefined;

/**
 * Loads the sandbox. Rendering is synchronous, so this has to have finished
 * before the first expression is evaluated; the engine awaits it when a run
 * starts.
 */
export const ensureExpressionEngine = (): Promise<void> => {
  loading ??= getQuickJS().then((module) => {
    quickjs = module;
  });

  return loading;
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

  if (!quickjs) {
    // Starts loading so a retry succeeds
    void ensureExpressionEngine();

    throw new Error(
      "The expression engine is still starting. Run the workflow again."
    );
  }

  const runtime = quickjs.newRuntime();
  runtime.setMemoryLimit(MEMORY_LIMIT_BYTES);
  runtime.setMaxStackSize(MAX_STACK_BYTES);

  const vm = runtime.newContext();

  try {
    const contextJson = vm.newString(JSON.stringify(context ?? {}));
    vm.setProp(vm.global, "__contextJson", contextJson);
    contextJson.dispose();

    const prelude = vm.evalCode(PRELUDE, "expression-prelude.js");
    if (prelude.error) {
      const error = vm.dump(prelude.error);
      prelude.error.dispose();
      throw new Error(error?.message || "could not read the workflow data");
    }
    prelude.value.dispose();

    return expressions.map((expression) => {
      // Each expression gets its own time budget
      runtime.setInterruptHandler(
        shouldInterruptAfterDeadline(Date.now() + TIMEOUT_MS)
      );

      const result = vm.evalCode(
        `__format((\n${expression}\n))`,
        "expression.js"
      );

      if (result.error) {
        const error = vm.dump(result.error);
        result.error.dispose();

        const message: string = error?.message || String(error);

        throw new ExpressionError(
          expression,
          message === "interrupted"
            ? `it ran for more than ${TIMEOUT_MS}ms`
            : message
        );
      }

      const text = vm.dump(result.value) as string;
      result.value.dispose();

      return text;
    });
  } finally {
    vm.dispose();
    runtime.dispose();
  }
};
