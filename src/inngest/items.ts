import type { WorkflowContext } from "@/features/executions/types";

// n8n passes a list of items from node to node and runs each node once per
// item. RXJ gets the same behaviour on top of its shared variables:
//
//   - A list node (Split Out, Sort, Limit, Remove Duplicates, Summarize,
//     RSS Read, or a Merge that combines lists) sends its list down its
//     connections as items.
//   - Every node after it runs once per item, with the item available as
//     {{item}} / {{ $json }}, until an Aggregate or Loop node ends the list.
//   - IF, Filter, Switch and Text Classifier route each item separately.
//
// Without a list node nothing changes: nodes run once, as before.

/**
 * One item on a connection. `vars` holds what earlier per-item nodes
 * produced for this item, so {{myApiCall.httpResponse.data}} in a later
 * node means the response that belongs to this item (n8n's paired items).
 */
export type StreamItem = {
  json: unknown;
  vars: Record<string, unknown>;
};

// Key for items that leave through every output of a node
export const ALL_OUTPUTS = "*";

export type NodeRunResult = {
  context: WorkflowContext;
  // Items per output handle; null when the node is not part of an item list
  outputItems: Record<string, StreamItem[]> | null;
};

type ItemNode = { id: string; type: string; data?: unknown };

export const MAX_ITEMS_PER_NODE =
  Number(process.env.MAX_ITEMS_PER_NODE) || 100;

// Injected into the context while a node runs for one item / for all items
const ITEM_KEY = "item";
const ITEM_INDEX_KEY = "itemIndex";
const ITEMS_KEY = "items";

// Their result is a list that becomes the items of the following nodes
const LIST_OUTPUT_TYPES = new Set([
  "SPLIT_OUT",
  "SORT",
  "LIMIT",
  "REMOVE_DUPLICATES",
  "SUMMARIZE",
  "MERGE",
  "RSS_READ",
  // The rows of a CSV (or the entries of a JSON list)
  "EXTRACT_FROM_FILE",
]);

// After these the workflow is back to running each node once
// (Convert to File writes all incoming items into one file.)
const LIST_END_TYPES = new Set(["AGGREGATE", "LOOP", "CONVERT_TO_FILE"]);

// Run once and see all incoming items together, like n8n's "Run Once for
// All Items". Items pass through the ones that do not produce a new list.
const RUN_ONCE_TYPES = new Set([
  ...LIST_OUTPUT_TYPES,
  ...LIST_END_TYPES,
  // Sees every item as context.items. Its result does not start a list by
  // itself (existing workflows return lists from Code); add a Split Out.
  "CODE",
  "DELAY",
  "RESPOND_TO_WEBHOOK",
  "WEBHOOK_RESPONSE",
  "STOP_AND_ERROR",
  "BUFFER_MEMORY",
  "STRUCTURED_OUTPUT_PARSER",
  "MODEL_ROUTER",
]);

// Decide per item which output it leaves through; the item itself is
// forwarded unchanged
const ROUTER_TYPES = new Set(["IF", "FILTER", "SWITCH", "TEXT_CLASSIFIER"]);

// Written by the routers for the engine, not data of the item
const ROUTING_KEYS = new Set(["ifResult", "filterPassed", "matchedBranch"]);

const getVariableName = (node: ItemNode): string | undefined => {
  const name = (node.data as { variableName?: unknown } | null)?.variableName;

  return typeof name === "string" && name.trim() ? name.trim() : undefined;
};

/**
 * The list a list node produced, stored under its variable as
 * `{ items, count }`.
 */
const readOutputList = (
  node: ItemNode,
  context: WorkflowContext
): unknown[] | null => {
  const name =
    getVariableName(node) ?? (node.type === "MERGE" ? "merge" : undefined);
  if (!name) return null;

  const value = context[name];

  if (Array.isArray(value)) return value;

  const items = (value as { items?: unknown } | null)?.items;

  return Array.isArray(items) ? items : null;
};

const withoutKeys = (
  output: WorkflowContext,
  before: WorkflowContext,
  keys: string[]
): WorkflowContext => {
  const cleaned = { ...output };

  for (const key of keys) {
    // Put back whatever the user had under that name before
    if (key in before) cleaned[key] = before[key];
    else delete cleaned[key];
  }

  return cleaned;
};

/**
 * Runs one node for the items arriving at it.
 *
 * `execute` runs the node's executor once with the given context;
 * `getActiveOutputs` is the engine's rule for which outputs fired.
 */
export const runNodeForItems = async ({
  node,
  context,
  items,
  execute,
  getActiveOutputs,
}: {
  node: ItemNode;
  context: WorkflowContext;
  // null: the node is not downstream of a list node
  items: StreamItem[] | null;
  execute: (
    context: WorkflowContext,
    // The incoming items, for nodes that work on the whole list
    items: unknown[] | null
  ) => Promise<WorkflowContext>;
  getActiveOutputs: (
    node: ItemNode,
    context: WorkflowContext
  ) => string[] | null;
}): Promise<NodeRunResult> => {
  // ---------------------------------------------------------------------
  // No incoming items: run once. A list node starts a list here.
  // ---------------------------------------------------------------------
  if (!items) {
    const output = await execute(context, null);

    const list = LIST_OUTPUT_TYPES.has(node.type)
      ? readOutputList(node, output)
      : null;

    return {
      context: output,
      outputItems: list
        ? { [ALL_OUTPUTS]: list.map((json) => ({ json, vars: {} })) }
        : null,
    };
  }

  // n8n's "Execute Once" node setting: only the first item is processed
  const executeOnce =
    (node.data as { executeOnce?: unknown } | null)?.executeOnce === true;
  const incoming = executeOnce ? items.slice(0, 1) : items;

  // ---------------------------------------------------------------------
  // Nodes that see all items together
  // ---------------------------------------------------------------------
  if (RUN_ONCE_TYPES.has(node.type)) {
    const values = incoming.map((item) => item.json);

    const output = withoutKeys(
      await execute({ ...context, [ITEMS_KEY]: values }, values),
      context,
      [ITEMS_KEY]
    );

    if (LIST_END_TYPES.has(node.type)) {
      return { context: output, outputItems: null };
    }

    const list = LIST_OUTPUT_TYPES.has(node.type)
      ? readOutputList(node, output)
      : null;

    if (!list) {
      // Delay, Respond to Webhook...: the items continue unchanged
      return { context: output, outputItems: { [ALL_OUTPUTS]: incoming } };
    }

    // Items that survive (Sort, Limit, Remove Duplicates) keep what earlier
    // nodes produced for them; new items (Summarize, Split Out) start fresh
    const known = new Map<unknown, StreamItem>();
    for (const item of incoming) {
      if (item.json !== null && typeof item.json === "object") {
        known.set(item.json, item);
      }
    }

    return {
      context: output,
      outputItems: {
        [ALL_OUTPUTS]: list.map((json) => ({
          json,
          vars: known.get(json)?.vars ?? {},
        })),
      },
    };
  }

  // ---------------------------------------------------------------------
  // Everything else runs once per item
  // ---------------------------------------------------------------------
  if (incoming.length > MAX_ITEMS_PER_NODE) {
    throw new Error(
      `${incoming.length} items reached this node but the limit is ${MAX_ITEMS_PER_NODE} per node. Add a Limit node before it, or process the list in smaller parts.`
    );
  }

  const isRouter = ROUTER_TYPES.has(node.type);
  const variableName = getVariableName(node);

  const routed: Record<string, StreamItem[]> = {};
  const values: unknown[] = [];
  let lastProduced: Record<string, unknown> = {};

  for (let index = 0; index < incoming.length; index++) {
    const item = incoming[index];

    const itemContext: WorkflowContext = {
      ...context,
      // What earlier nodes produced for this very item
      ...item.vars,
      [ITEM_KEY]: item.json,
      [ITEM_INDEX_KEY]: index,
    };

    const output = await execute(itemContext, null);

    const produced: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(output)) {
      if (
        key !== ITEM_KEY &&
        key !== ITEM_INDEX_KEY &&
        !ROUTING_KEYS.has(key) &&
        itemContext[key] !== value
      ) {
        produced[key] = value;
      }
    }

    let next: StreamItem;

    if (isRouter) {
      next = item;
    } else {
      const keys = Object.keys(produced);

      // The node's result is the next node's item. A node that produced
      // nothing (it only sent a message, say) passes its item on.
      const value =
        variableName && variableName in produced
          ? produced[variableName]
          : keys.length === 0
            ? item.json
            : keys.length === 1
              ? produced[keys[0]]
              : produced;

      values.push(value);
      lastProduced = produced;
      next = { json: value, vars: { ...item.vars, ...produced } };
    }

    const outputs = getActiveOutputs(node, output);

    for (const handle of outputs ?? [ALL_OUTPUTS]) {
      routed[handle] = [...(routed[handle] ?? []), next];
    }
  }

  // Outside the item list (after an Aggregate, or in the execution log) the
  // node's variable holds every item's result
  const finalContext: WorkflowContext = isRouter
    ? context
    : {
        ...context,
        ...lastProduced,
        ...(variableName
          ? { [variableName]: { items: values, count: values.length } }
          : {}),
      };

  return { context: finalContext, outputItems: routed };
};
