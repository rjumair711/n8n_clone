import toposort from "toposort";
import type { WorkflowContext } from "@/features/executions/types";
import { ALL_OUTPUTS, type NodeRunResult, type StreamItem } from "./items";

// Structural types so the engine can be exercised without Prisma rows
export type EngineNode = {
  id: string;
  type: string;
  data?: unknown;
};

export type EngineConnection = {
  fromNodeId: string;
  toNodeId: string;
  fromOutput: string;
  toInput: string;
};

const TRIGGER_TYPES = new Set([
  "INITIAL",
  "MANUAL_TRIGGER",
  "SCHEDULE_TRIGGER",
  "GOOGLE_FORM_TRIGGER",
  "STRIPE_TRIGGER",
  "WEBHOOK_TRIGGER",
  "CHAT_TRIGGER",
  "ERROR_TRIGGER",
  "TELEGRAM_TRIGGER",
  "WHATSAPP_TRIGGER",
  "EXECUTE_WORKFLOW_TRIGGER",
  "GMAIL_TRIGGER",
  "TYPEFORM_TRIGGER",
  "RSS_FEED_TRIGGER",
]);

// Nodes with "sub-" ports that other nodes plug into as configuration
const SUB_PORT_HOST_TYPES = new Set([
  "AI_AGENT",
  "TEXT_CLASSIFIER",
  "INFORMATION_EXTRACTOR",
]);

// Nodes the AI Agent reads as configuration instead of running as steps
const AGENT_SUPPLY_TYPES = new Set([
  "GEMINI",
  "OPENAI",
  "ANTHROPIC",
  "CHAT_MODEL",
  "DEEPSEEK",
  "KIMI",
  "QWEN",
  "BUFFER_MEMORY",
]);

export const LOOP_BODY_OUTPUT = "loop";
export const LOOP_DONE_OUTPUT = "done";
export const LOOP_DEFAULT_MAX_ITERATIONS = 100;
export const LOOP_HARD_MAX_ITERATIONS = 200;

export type WorkflowGraph<N extends EngineNode, C extends EngineConnection> = {
  nodeById: Map<string, N>;
  // Flow nodes in topological order
  order: string[];
  incoming: Map<string, C[]>;
  outgoing: Map<string, C[]>;
};

/**
 * Splits the canvas into the main flow and the AI Agent's supply nodes
 * (model / memory / tools), then sorts the main flow topologically.
 */
export const buildGraph = <N extends EngineNode, C extends EngineConnection>(
  nodes: N[],
  connections: C[]
): WorkflowGraph<N, C> => {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  const isSupplyEdge = (conn: C) => {
    const source = nodeById.get(conn.fromNodeId);
    const target = nodeById.get(conn.toNodeId);

    if (!source || !target || !SUB_PORT_HOST_TYPES.has(target.type)) {
      return false;
    }

    return (
      conn.toInput.startsWith("sub-") ||
      // Older agent workflows connected the model without naming the port
      (target.type === "AI_AGENT" && AGENT_SUPPLY_TYPES.has(source.type))
    );
  };

  const validConnections = connections.filter(
    (conn) => nodeById.has(conn.fromNodeId) && nodeById.has(conn.toNodeId)
  );

  // A node whose every output feeds an agent sub-port never runs on its own
  const supplyNodeIds = new Set<string>();
  for (const node of nodes) {
    const outputs = validConnections.filter(
      (conn) => conn.fromNodeId === node.id
    );

    if (outputs.length > 0 && outputs.every(isSupplyEdge)) {
      supplyNodeIds.add(node.id);
    }
  }

  const flowEdges = validConnections.filter(
    (conn) =>
      !isSupplyEdge(conn) &&
      !supplyNodeIds.has(conn.fromNodeId) &&
      !supplyNodeIds.has(conn.toNodeId)
  );

  const flowNodeIds = nodes
    .map((node) => node.id)
    .filter((id) => !supplyNodeIds.has(id));

  let order: string[];
  try {
    order = toposort.array(
      flowNodeIds,
      flowEdges.map((conn): [string, string] => [
        conn.fromNodeId,
        conn.toNodeId,
      ])
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("Cyclic")) {
      throw new Error("Workflow contains a cycle");
    }
    throw error;
  }

  const incoming = new Map<string, C[]>();
  const outgoing = new Map<string, C[]>();
  for (const id of flowNodeIds) {
    incoming.set(id, []);
    outgoing.set(id, []);
  }
  for (const conn of flowEdges) {
    outgoing.get(conn.fromNodeId)!.push(conn);
    incoming.get(conn.toNodeId)!.push(conn);
  }

  return { nodeById, order, incoming, outgoing };
};

/**
 * Execution starts at trigger nodes. When the event names the trigger that
 * fired, only triggers of that type start, so a webhook call does not also
 * run the branch hanging off the manual trigger.
 */
export const getStartNodeIds = <N extends EngineNode, C extends EngineConnection>(
  graph: WorkflowGraph<N, C>,
  trigger?: string
): string[] => {
  const roots = graph.order.filter(
    (id) => graph.incoming.get(id)!.length === 0
  );

  const triggers = roots.filter((id) =>
    TRIGGER_TYPES.has(graph.nodeById.get(id)!.type)
  );

  // Workflows without any trigger node keep the old "run everything" behaviour
  if (triggers.length === 0) return roots;

  if (trigger) {
    const matching = triggers.filter(
      (id) => graph.nodeById.get(id)!.type === trigger
    );
    if (matching.length > 0) return matching;
  }

  return triggers;
};

/**
 * Which output handles a node fires after it ran.
 * `null` means every output.
 */
export const getActiveOutputs = (
  node: EngineNode,
  context: WorkflowContext
): string[] | null => {
  switch (node.type) {
    case "FILTER":
      return context.filterPassed === false ? [] : null;

    case "IF":
      return [context.ifResult === true ? "true" : "false"];

    case "SWITCH":
    // The classifier picks one category output, like a Switch rule
    case "TEXT_CLASSIFIER":
      return typeof context.matchedBranch === "string"
        ? [context.matchedBranch]
        : [];

    default:
      return null;
  }
};

const getReachable = <N extends EngineNode, C extends EngineConnection>(
  graph: WorkflowGraph<N, C>,
  startEdges: C[]
): Set<string> => {
  const seen = new Set<string>();
  const queue = startEdges.map((conn) => conn.toNodeId);

  while (queue.length > 0) {
    const id = queue.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);

    for (const conn of graph.outgoing.get(id) ?? []) {
      queue.push(conn.toNodeId);
    }
  }

  return seen;
};

/**
 * The loop body is everything reachable from the "loop" output that is not
 * also reachable from the "done" output (those nodes run once, afterwards).
 */
export const getLoopBody = <N extends EngineNode, C extends EngineConnection>(
  graph: WorkflowGraph<N, C>,
  loopNodeId: string
): Set<string> => {
  const outputs = graph.outgoing.get(loopNodeId) ?? [];

  const body = getReachable(
    graph,
    outputs.filter((conn) => conn.fromOutput === LOOP_BODY_OUTPUT)
  );
  const after = getReachable(
    graph,
    outputs.filter((conn) => conn.fromOutput !== LOOP_BODY_OUTPUT)
  );

  for (const id of after) body.delete(id);

  return body;
};

export const getLoopVariableName = (node: EngineNode): string => {
  const data = (node.data ?? {}) as { variableName?: string };
  return data.variableName?.trim() || "loop";
};

export type NodeRunMeta = {
  // How many of the node's connected inputs were reached in this run
  inputs: { active: number; total: number };
  // The items arriving from a list node upstream; null when there are none
  // and the node simply runs once (see ./items.ts)
  items: StreamItem[] | null;
};

// A runner that knows nothing about items may return just the context
export type RunNode<N extends EngineNode> = (
  node: N,
  context: WorkflowContext,
  meta: NodeRunMeta
) => Promise<WorkflowContext | NodeRunResult>;

const isNodeRunResult = (
  value: WorkflowContext | NodeRunResult
): value is NodeRunResult =>
  "outputItems" in value &&
  "context" in value &&
  (value.outputItems === null || typeof value.outputItems === "object");

type WalkParams<N extends EngineNode, C extends EngineConnection> = {
  graph: WorkflowGraph<N, C>;
  // Nodes this walk may run; `null` means the whole graph
  scope: Set<string> | null;
  startNodeIds: Set<string>;
  activeEdges: Set<C>;
  // The items travelling on each connection, for connections that carry any
  edgeItems: Map<C, StreamItem[]>;
  context: WorkflowContext;
  runNode: RunNode<N>;
};

const walk = async <N extends EngineNode, C extends EngineConnection>({
  graph,
  scope,
  startNodeIds,
  activeEdges,
  edgeItems,
  context,
  runNode,
}: WalkParams<N, C>): Promise<WorkflowContext> => {
  const scopedOrder = graph.order.filter((id) => !scope || scope.has(id));

  // Loop bodies are driven by their Loop node, not by this walk
  const loopBodies = new Map<string, Set<string>>();
  const nested = new Set<string>();
  for (const id of scopedOrder) {
    if (graph.nodeById.get(id)!.type !== "LOOP") continue;

    const body = getLoopBody(graph, id);
    if (scope) {
      for (const bodyId of body) {
        if (!scope.has(bodyId)) body.delete(bodyId);
      }
    }
    loopBodies.set(id, body);
    for (const bodyId of body) nested.add(bodyId);
  }

  for (const id of scopedOrder) {
    if (nested.has(id)) continue;

    const node = graph.nodeById.get(id)!;
    const inputs = graph.incoming.get(id)!;
    const activeInputs = inputs.filter((conn) => activeEdges.has(conn));

    if (!startNodeIds.has(id) && activeInputs.length === 0) continue;

    // Merge in "all" mode only continues once every connected branch arrived
    if (
      node.type === "MERGE" &&
      (node.data as { mode?: string } | undefined)?.mode === "all" &&
      activeInputs.length < inputs.length
    ) {
      continue;
    }

    // Items from every branch that reached this node, in connection order
    const incomingLists = activeInputs.flatMap((conn) => {
      const list = edgeItems.get(conn);
      return list ? [list] : [];
    });

    const result = await runNode(node, context, {
      inputs: { active: activeInputs.length, total: inputs.length },
      items: incomingLists.length > 0 ? incomingLists.flat() : null,
    });

    const outputItems = isNodeRunResult(result) ? result.outputItems : null;
    context = isNodeRunResult(result) ? result.context : result;

    const outputs = graph.outgoing.get(id)!;

    if (node.type === "LOOP") {
      const variableName = getLoopVariableName(node);
      const state = (context[variableName] ?? {}) as { items?: unknown[] };
      const items = Array.isArray(state.items) ? state.items : [];
      const bodyEdges = outputs.filter(
        (conn) => conn.fromOutput === LOOP_BODY_OUTPUT
      );

      for (let index = 0; index < items.length; index++) {
        context = await walk({
          graph,
          scope: loopBodies.get(id)!,
          startNodeIds: new Set(),
          activeEdges: new Set(bodyEdges),
          // The body runs once per iteration, with {{loop.item}}
          edgeItems: new Map(),
          context: {
            ...context,
            [variableName]: {
              item: items[index],
              index,
              total: items.length,
              isFirst: index === 0,
              isLast: index === items.length - 1,
            },
          },
          runNode,
        });
      }

      context = {
        ...context,
        [variableName]: { total: items.length, done: true },
      };

      for (const conn of outputs) {
        if (conn.fromOutput !== LOOP_BODY_OUTPUT) activeEdges.add(conn);
      }

      continue;
    }

    // The node handled a list of items: each output carries the items
    // routed to it, and a connection without items does not continue
    if (outputItems) {
      for (const conn of outputs) {
        const list = outputItems[conn.fromOutput] ?? outputItems[ALL_OUTPUTS];

        if (list && list.length > 0) {
          activeEdges.add(conn);
          edgeItems.set(conn, list);
        }
      }

      continue;
    }

    const activeOutputs = getActiveOutputs(node, context);
    for (const conn of outputs) {
      if (activeOutputs === null || activeOutputs.includes(conn.fromOutput)) {
        activeEdges.add(conn);
      }
    }
  }

  return context;
};

/**
 * Runs a workflow by following only the connections that were actually
 * activated, so IF / Switch / Filter decide which branches execute.
 */
export const runWorkflowGraph = async <
  N extends EngineNode,
  C extends EngineConnection
>(params: {
  graph: WorkflowGraph<N, C>;
  trigger?: string;
  context: WorkflowContext;
  runNode: RunNode<N>;
}): Promise<WorkflowContext> => {
  return walk({
    graph: params.graph,
    scope: null,
    startNodeIds: new Set(getStartNodeIds(params.graph, params.trigger)),
    activeEdges: new Set<C>(),
    edgeItems: new Map<C, StreamItem[]>(),
    context: params.context,
    runNode: params.runNode,
  });
};
