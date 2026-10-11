import { ExecutionStatus, Prisma } from "@prisma/client";
import { NonRetriableError } from "inngest";
import prisma from "@/lib/db";

// The database side of pausing a run: what the Wait node and approval
// requests do before and after their Inngest sleep or wait-for-event. Call
// both from inside a step.

/**
 * Marks the execution, and the node that pauses it, as Waiting.
 */
export const markExecutionWaiting = async ({
  executionId,
  nodeId,
  waitingFor,
  until,
  data,
}: {
  executionId: string;
  nodeId: string;
  // "time", "webhook", "approval" or "form"
  waitingFor: string;
  until: Date;
  // For "form": the page that is shown
  data?: Prisma.InputJsonValue;
}) => {
  await prisma.execution.updateMany({
    where: { id: executionId, status: ExecutionStatus.RUNNING },
    data: {
      status: ExecutionStatus.WAITING,
      waitingFor,
      waitingUntil: until,
      ...(data === undefined ? {} : { waitingData: data }),
    },
  });

  await prisma.executionNode.updateMany({
    where: { executionId, nodeId, status: ExecutionStatus.RUNNING },
    data: { status: ExecutionStatus.WAITING },
  });
};

/**
 * Marks them as Running again. Throws when the execution was cancelled
 * while it waited, so the run does not go on.
 */
export const markExecutionResumed = async ({
  executionId,
  nodeId,
  label,
}: {
  executionId: string;
  nodeId: string;
  // For the error message, e.g. "Wait node"
  label: string;
}) => {
  const resumed = await prisma.execution.updateMany({
    where: { id: executionId, status: ExecutionStatus.WAITING },
    data: {
      status: ExecutionStatus.RUNNING,
      waitingFor: null,
      waitingUntil: null,
      waitingData: Prisma.DbNull,
    },
  });

  if (resumed.count === 0) {
    const current = await prisma.execution.findUnique({
      where: { id: executionId },
      select: { status: true },
    });

    // Cancelled just as the wait ended: the run must not go on.
    // (Still RUNNING means this step is being retried.)
    if (current?.status !== ExecutionStatus.RUNNING) {
      throw new NonRetriableError(
        `${label}: the execution was cancelled while it was waiting`
      );
    }
  }

  await prisma.executionNode.updateMany({
    where: { executionId, nodeId, status: ExecutionStatus.WAITING },
    data: { status: ExecutionStatus.RUNNING },
  });
};
