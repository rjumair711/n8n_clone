import "server-only";

import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import {
  WORKFLOW_VERSION_DAYS,
  WORKFLOW_VERSION_LIMIT,
  diffSnapshots,
  readVersionSnapshot,
  selectVersionsToPrune,
  stableStringify,
  toVersionSnapshot,
  type VersionSnapshot,
} from "../lib/versions";

// The database side of version history. A version is a copy of the
// workflow's nodes and connections as they are stored, so it holds what
// they hold (also a secret typed into a node) and is only ever read for the
// workflow's owner.

const VERSION_LIMIT = Number(process.env.WORKFLOW_VERSION_LIMIT) || WORKFLOW_VERSION_LIMIT;
const VERSION_DAYS = Number(process.env.WORKFLOW_VERSION_DAYS) || WORKFLOW_VERSION_DAYS;

export const hashSnapshot = (snapshot: VersionSnapshot) =>
  createHash("sha256").update(stableStringify(snapshot), "utf8").digest("hex");

type StoredNode = {
  id: string;
  type: string;
  position: unknown;
  data: unknown;
  credentialId?: string | null;
};

type StoredConnection = {
  fromNodeId: string;
  toNodeId: string;
  fromOutput: string;
  toInput: string;
};

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/**
 * Removes the versions that are past their time (see selectVersionsToPrune).
 */
export const pruneWorkflowVersions = async (workflowId: string) => {
  const versions = await prisma.workflowVersion.findMany({
    where: { workflowId },
    select: { id: true, number: true, createdAt: true },
  });

  const ids = selectVersionsToPrune(versions, new Date(), {
    limit: VERSION_LIMIT,
    days: VERSION_DAYS,
  });

  if (ids.length === 0) return 0;

  const removed = await prisma.workflowVersion.deleteMany({
    where: { workflowId, id: { in: ids } },
  });

  return removed.count;
};

/**
 * Makes sure the workflow's newest version is the given nodes and
 * connections, and returns it. Nothing is added when they are what the
 * newest version already holds.
 */
export const saveWorkflowVersion = async ({
  workflowId,
  nodes,
  connections,
  restoredFromNumber,
}: {
  workflowId: string;
  nodes: StoredNode[];
  connections: StoredConnection[];
  // The version that was restored to get here
  restoredFromNumber?: number;
}): Promise<{ id: string; number: number; created: boolean }> => {
  const snapshot = toVersionSnapshot(nodes, connections);
  const contentHash = hashSnapshot(snapshot);

  // Two saves at the same moment want the same number: the second tries again
  for (let attempt = 0; ; attempt++) {
    const latest = await prisma.workflowVersion.findFirst({
      where: { workflowId },
      orderBy: { number: "desc" },
      select: { id: true, number: true, contentHash: true, nodes: true, connections: true },
    });

    if (latest?.contentHash === contentHash && restoredFromNumber === undefined) {
      return { id: latest.id, number: latest.number, created: false };
    }

    const summary = diffSnapshots(
      latest ? readVersionSnapshot(latest.nodes, latest.connections) : null,
      snapshot
    );

    try {
      const created = await prisma.workflowVersion.create({
        data: {
          workflowId,
          number: (latest?.number ?? 0) + 1,
          nodes: snapshot.nodes as unknown as Prisma.InputJsonValue,
          connections: snapshot.connections as unknown as Prisma.InputJsonValue,
          contentHash,
          summary: summary as unknown as Prisma.InputJsonValue,
          restoredFromNumber: restoredFromNumber ?? null,
        },
        select: { id: true, number: true },
      });

      await pruneWorkflowVersions(workflowId);

      return { ...created, created: true };
    } catch (error) {
      if (!isUniqueViolation(error) || attempt >= 2) throw error;
    }
  }
};

/**
 * The version a run uses: the workflow as it is stored right now. Written
 * on the execution with its number, which stays readable after the version
 * itself was removed. Never throws: a run must not fail over its history.
 */
export const recordExecutionVersion = async ({
  executionId,
  workflowId,
  nodes,
  connections,
}: {
  executionId: string;
  workflowId: string;
  nodes: StoredNode[];
  connections: StoredConnection[];
}) => {
  try {
    const version = await saveWorkflowVersion({ workflowId, nodes, connections });

    await prisma.execution.update({
      where: { id: executionId },
      data: { workflowVersionId: version.id, workflowVersionNumber: version.number },
    });
  } catch (error) {
    console.error(
      "[RXJ] Could not record the workflow version of an execution:",
      error instanceof Error ? error.name : "error"
    );
  }
};
