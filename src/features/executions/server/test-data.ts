import "server-only";

import { ExecutionStatus, Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { getNodeContribution } from "@/inngest/items";

// The data test runs from the editor use in place of running a node: pinned
// data, and for a partial run the data a node saved in an earlier run.
//
// Both come from what executions stored about their nodes, which went
// through the run's redaction first: a secret that was masked there is
// masked here too.

// One node's pinned data, as JSON text
export const MAX_PINNED_DATA_BYTES =
  (Number(process.env.MAX_PINNED_DATA_KB) || 512) * 1024;

export type NodeDataSource = "pinned" | "saved";

export class PinError extends Error {}

export const loadPinnedNodeIds = async (workflowId: string): Promise<string[]> =>
  (
    await prisma.pinnedData.findMany({
      where: { workflowId },
      select: { nodeId: true },
    })
  ).map((pin) => pin.nodeId);

// The newest stored result of a node in this workflow
const findSavedNodeRun = (
  workflowId: string,
  nodeId: string,
  exceptExecutionId?: string
) =>
  prisma.executionNode.findFirst({
    where: {
      nodeId,
      status: ExecutionStatus.SUCCESS,
      output: { not: Prisma.DbNull },
      execution: { workflowId },
      ...(exceptExecutionId ? { executionId: { not: exceptExecutionId } } : {}),
    },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      executionId: true,
      input: true,
      output: true,
      startedAt: true,
    },
  });

/**
 * The data that stands in for a node in a test run, or null when there is
 * none: its pin, or what it added to the workflow's data the last time it
 * ran.
 */
export const loadNodeData = async ({
  workflowId,
  nodeId,
  source,
  isStart,
  executionId,
}: {
  workflowId: string;
  nodeId: string;
  source: NodeDataSource;
  // The node has nothing before it (a trigger)
  isStart: boolean;
  // The run that is asking: its own node logs are not "an earlier run"
  executionId: string;
}): Promise<Record<string, unknown> | null> => {
  if (source === "pinned") {
    const pin = await prisma.pinnedData.findUnique({
      where: { workflowId_nodeId: { workflowId, nodeId } },
      select: { data: true },
    });

    return pin ? ((pin.data ?? {}) as Record<string, unknown>) : null;
  }

  const saved = await findSavedNodeRun(workflowId, nodeId, executionId);

  return saved
    ? getNodeContribution({ input: saved.input, output: saved.output, isStart })
    : null;
};

/**
 * Where a partial run starts: of the nodes that can start the part before
 * the chosen node, a pinned one, or else the one that ran most recently.
 * Null when none of them has any data.
 */
export const pickPartialRunStart = async ({
  workflowId,
  rootIds,
  pinnedNodeIds,
  executionId,
}: {
  workflowId: string;
  rootIds: string[];
  pinnedNodeIds: string[];
  executionId: string;
}): Promise<string | null> => {
  const pinned = rootIds.find((id) => pinnedNodeIds.includes(id));
  if (pinned) return pinned;

  const latest = await prisma.executionNode.findFirst({
    where: {
      nodeId: { in: rootIds },
      status: ExecutionStatus.SUCCESS,
      output: { not: Prisma.DbNull },
      execution: { workflowId },
      executionId: { not: executionId },
    },
    orderBy: { startedAt: "desc" },
    select: { nodeId: true },
  });

  return latest?.nodeId ?? null;
};

// =========================================================================
// PINNING (called by the workflows router, after its ownership check)
// =========================================================================
/**
 * Pins what a node produced: in the given execution, or in the newest run
 * that has its output. Replaces the node's pin if it has one.
 */
export const pinNodeData = async ({
  workflowId,
  nodeId,
  executionId,
}: {
  workflowId: string;
  nodeId: string;
  executionId?: string;
}) => {
  const node = await prisma.node.findFirst({
    where: { id: nodeId, workflowId },
    select: { id: true },
  });

  if (!node) {
    throw new PinError("That node is not in the saved workflow. Save the workflow and try again.");
  }

  const saved = executionId
    ? await prisma.executionNode.findFirst({
        where: {
          nodeId,
          executionId,
          status: ExecutionStatus.SUCCESS,
          output: { not: Prisma.DbNull },
          // Of this workflow: an execution id from elsewhere finds nothing
          execution: { workflowId },
        },
        orderBy: { startedAt: "desc" },
        select: { executionId: true, input: true, output: true },
      })
    : await findSavedNodeRun(workflowId, nodeId);

  if (!saved) {
    throw new PinError(
      executionId
        ? "That execution has no saved output of this node."
        : "This node has no saved output yet. Run the workflow once, then pin it. (A workflow set to \"Don't save node input/output\" keeps none.)"
    );
  }

  const isStart =
    (await prisma.connection.count({ where: { workflowId, toNodeId: nodeId } })) === 0;

  const data = getNodeContribution({
    input: saved.input,
    output: saved.output,
    isStart,
  });

  const bytes = Buffer.byteLength(JSON.stringify(data), "utf8");

  if (bytes > MAX_PINNED_DATA_BYTES) {
    throw new PinError(
      `This node's output is ${Math.ceil(bytes / 1024)} KB; up to ${Math.round(MAX_PINNED_DATA_BYTES / 1024)} KB can be pinned.`
    );
  }

  const json = data as Prisma.InputJsonValue;

  await prisma.pinnedData.upsert({
    where: { workflowId_nodeId: { workflowId, nodeId } },
    create: { workflowId, nodeId, data: json, executionId: saved.executionId },
    update: { data: json, executionId: saved.executionId, createdAt: new Date() },
  });

  return { nodeId, executionId: saved.executionId, variables: Object.keys(data) };
};

export const unpinNodeData = async (workflowId: string, nodeId: string) => {
  const removed = await prisma.pinnedData.deleteMany({
    where: { workflowId, nodeId },
  });

  return removed.count;
};

/**
 * Removes the pins of nodes that are no longer in the workflow.
 */
export const removeStalePins = async (workflowId: string, nodeIds: string[]) => {
  const removed = await prisma.pinnedData.deleteMany({
    where: { workflowId, nodeId: { notIn: nodeIds } },
  });

  return removed.count;
};
