import { ExecutionStatus } from "@prisma/client";
import prisma from "@/lib/db";
import { inngest } from "@/inngest/client";
import { NotFoundError, assertOwnership } from "@/lib/ownership";
import {
    EXECUTION_CANCELLED_MESSAGE,
    EXECUTION_CANCEL_EVENT,
} from "@/lib/execution-wait";
import { APPROVAL_STATUS } from "@/lib/approvals";

export class CancelError extends Error {
    constructor(
        message: string,
        // Maps to the tRPC code of the caller
        public readonly reason: "not_found" | "not_waiting"
    ) {
        super(message);
        this.name = "CancelError";
    }
}

/**
 * Cancels an execution that is paused at a Wait node: it is marked as
 * failed with "Cancelled by the user", and the sleeping Inngest run is
 * stopped so the nodes after the Wait node never run.
 */
export const cancelExecution = async (executionId: string, userId: string) => {
    const found = await prisma.execution.findUnique({
        where: { id: executionId },
        select: {
            id: true,
            status: true,
            startedAt: true,
            workflow: { select: { userId: true } },
        },
    });

    let execution: NonNullable<typeof found>;
    try {
        execution = assertOwnership(
            found,
            userId,
            "Execution",
            (owned) => owned.workflow.userId
        );
    } catch (error) {
        // Another user's execution is "not found", like one that is missing
        if (error instanceof NotFoundError) {
            throw new CancelError(error.message, "not_found");
        }
        throw error;
    }

    const completedAt = new Date();

    // Only while it is still waiting: a run that was resumed a moment ago
    // is left alone
    const cancelled =
        execution.status === ExecutionStatus.WAITING
            ? await prisma.execution.updateMany({
                  where: { id: execution.id, status: ExecutionStatus.WAITING },
                  data: {
                      status: ExecutionStatus.FAILED,
                      error: EXECUTION_CANCELLED_MESSAGE,
                      completedAt,
                      durationMs:
                          completedAt.getTime() - execution.startedAt.getTime(),
                      waitingFor: null,
                      waitingUntil: null,
                  },
              })
            : { count: 0 };

    if (cancelled.count === 0) {
        throw new CancelError(
            "This execution is not waiting, so it cannot be cancelled.",
            "not_waiting"
        );
    }

    await prisma.executionNode.updateMany({
        where: { executionId: execution.id, status: ExecutionStatus.WAITING },
        data: {
            status: ExecutionStatus.FAILED,
            error: EXECUTION_CANCELLED_MESSAGE,
            completedAt,
        },
    });

    // A request it was waiting on can no longer be answered
    await prisma.approvalRequest.updateMany({
        where: { executionId: execution.id, status: APPROVAL_STATUS.PENDING },
        data: { status: APPROVAL_STATUS.CANCELLED },
    });

    // executeWorkflow's cancelOn listens for this. Should it not arrive, the
    // Wait node sees the execution is no longer waiting when it wakes up
    // and stops there.
    await inngest.send({
        name: EXECUTION_CANCEL_EVENT,
        data: { executionId: execution.id },
    });

    return { id: execution.id };
};
