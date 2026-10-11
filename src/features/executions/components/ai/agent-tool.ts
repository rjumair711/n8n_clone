import { NonRetriableError } from "inngest";
import type {
  NodeExecutor,
  NodeWithCredential,
  WorkflowContext,
} from "@/features/executions/types";
import {
  AGENT_TOOL_MAX_DEPTH,
  getBlockedToolsMessage,
} from "../../lib/agent-tools";

// Two nodes that only make sense on an AI Agent's Tools port:
//
//   Think Tool     the agent calls it to write down its reasoning. It does
//                  nothing else.
//   AI Agent Tool  another agent, with its own model, instructions and
//                  tools, that the first agent can hand a task to.

type Connection = { fromNodeId: string; toNodeId: string; toInput?: string | null };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const text = (value: unknown) => (typeof value === "string" ? value : "");

// =========================================================================
// THINK TOOL
// =========================================================================
export const THINK_ACKNOWLEDGEMENT = "Thought noted.";

/**
 * Takes the agent's thought and answers that it was noted. The thought is
 * in the agent's intermediate steps; nothing is stored, sent or changed.
 * Run as an ordinary step it passes the data on untouched.
 */
export const thinkToolExecutor: NodeExecutor = async ({ context, inline }) => {
  if (!inline) return context;

  return { ...context, thought: THINK_ACKNOWLEDGEMENT };
};

// =========================================================================
// AI AGENT TOOL
// =========================================================================
type AgentToolData = {
  toolName?: string;
  toolDescription?: string;
  systemMessage?: string;
  maxIterations?: string;
  maxToolCalls?: string;
  // "true": its own tools may include dangerous ones
  allowDangerousTools?: string;
};

const describe = (node: { data?: unknown }) => {
  const name = text((node.data as AgentToolData | null)?.toolName).trim();

  return name ? `AI Agent Tool "${name}"` : "AI Agent Tool";
};

/**
 * What is wrong with an AI Agent Tool node, found before the calling agent
 * starts: a mistake in the workflow should fail the run with its reason,
 * not reach the calling model as a tool that "did not work". Null when the
 * node is ready.
 */
export const getAgentToolProblem = (
  node: { id: string; data?: unknown },
  allNodes: { id: string; type: string; data?: unknown; name?: string }[],
  connections: Connection[]
): string | null => {
  const data = (isRecord(node.data) ? node.data : {}) as AgentToolData;
  const incoming = connections.filter((edge) => edge.toNodeId === node.id);
  const sources = (port: string) =>
    incoming
      .filter((edge) => (edge.toInput || "").toLowerCase().includes(port))
      .flatMap((edge) => allNodes.find((candidate) => candidate.id === edge.fromNodeId) ?? []);

  if (sources("model").length === 0) {
    return `${describe(node)}: connect a chat model to its Model port`;
  }

  if (!text(data.toolDescription).trim()) {
    return `${describe(node)}: Description is required. It tells the calling agent when to use this agent.`;
  }

  // Its own switch decides about its own dangerous tools
  const blocked = getBlockedToolsMessage(
    sources("tool").map((tool) => ({ type: tool.type, data: tool.data })),
    data.allowDangerousTools === "true"
  );

  return blocked ? blocked.replace(/^AI Agent:/, `${describe(node)}:`) : null;
};

/**
 * Runs as a tool of another agent: the calling model's `prompt` is this
 * agent's task. It has no part of the calling conversation, only the task,
 * and gives back its final answer.
 *
 * Its own tools run without asking for approval: a run can only pause for
 * a person at the top level. Whether a person approves is decided once,
 * for the whole call, by the calling agent's "Require approval" for this
 * tool.
 */
export const agentToolExecutor: NodeExecutor<AgentToolData> = async (params) => {
  const { data, context, inline } = params;
  const label = describe({ data });

  if (!inline) {
    throw new NonRetriableError(
      `${label}: connect it to an AI Agent's Tools port. It does not run as a step of its own.`
    );
  }

  if ((params.agentDepth ?? 0) > AGENT_TOOL_MAX_DEPTH) {
    throw new NonRetriableError(
      `${label}: agents are calling agents more than ${AGENT_TOOL_MAX_DEPTH} deep. Check that two AI Agent Tool nodes are not each other's tool.`
    );
  }

  const call = isRecord(context.ai) ? context.ai : {};
  const task = (text(call.prompt) || text(call.query)).trim();

  if (!task) {
    throw new NonRetriableError(`${label}: the calling agent gave no task`);
  }

  // The task is read from the data as a value. It is never put into the
  // node's settings as text, where {{ }} written by a model would be run
  // as an expression.
  const agentContext: WorkflowContext = { ...context, ai: { ...call, prompt: task } };

  // Taken from the registry when it is needed, not imported at the top: the
  // agent's executor and the registry import each other, and this file is
  // imported by both
  const { executorRegistry } = await import("../../lib/executor-registry");
  const runAgent = executorRegistry.AI_AGENT as NodeExecutor<Record<string, unknown>>;

  const result = await runAgent({
    ...params,
    context: agentContext,
    data: {
      promptType: "define",
      text: "{{ai.prompt}}",
      systemMessage: data.systemMessage,
      maxIterations: Number(data.maxIterations) || undefined,
      maxToolCalls: Number(data.maxToolCalls) || undefined,
      allowDangerousTools: data.allowDangerousTools === "true",
      variableName: "agentToolResult",
    },
  });

  const answer = (result.agentToolResult as { output?: unknown } | undefined)?.output;

  // Only the answer goes back to the calling agent
  return { ...context, agentAnswer: answer ?? "" };
};

// For the calling agent: the AI Agent Tool nodes among its tools that are
// not ready, as one message
export const getAgentToolProblems = (
  toolNodes: NodeWithCredential[],
  allNodes: NodeWithCredential[],
  connections: Connection[]
): string | null => {
  const problems = toolNodes
    .filter((node) => node.type === "AI_AGENT_TOOL")
    .flatMap((node) => getAgentToolProblem(node, allNodes, connections) ?? []);

  return problems.length ? problems.join(" ") : null;
};
