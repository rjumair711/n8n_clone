import type { NodeExecutor } from "@/features/executions/types";
import { normalizeToolName } from "@/lib/mcp-server";

// MCP Server Trigger: each trigger node of a workflow is one tool of the
// workflow's MCP server (src/app/api/mcp/[id]/route.ts). A tool call starts
// the workflow with {{mcp.tool}} and {{mcp.arguments}} in its data.
//
// A workflow can have several of these nodes, and a run starts at all of
// them. Each one says here whether the call was for its tool; the engine
// only goes on from the one it was for (see getActiveOutputs).

type McpServerTriggerData = {
  toolName?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Whether a tool call is for this trigger node: by the node's id when the
 * call names one (a real call does), otherwise by the tool's name (a test
 * run from the editor).
 */
export const isCalledTool = (
  call: unknown,
  nodeId: string,
  toolName: string | undefined
): boolean => {
  if (!isRecord(call)) return false;

  if (typeof call.nodeId === "string" && call.nodeId) return call.nodeId === nodeId;

  return typeof call.tool === "string" && call.tool === normalizeToolName(toolName);
};

export const mcpServerTriggerExecutor: NodeExecutor<McpServerTriggerData> = async ({
  data,
  nodeId,
  context,
}) => ({
  ...context,
  mcpToolMatched: isCalledTool(context.mcp, nodeId, data.toolName),
});
