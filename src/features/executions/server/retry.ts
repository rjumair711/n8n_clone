import { ExecutionStatus, type Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { sendWorkflowExecution } from "@/inngest/utils";
import { PLAN_LIMITS } from "@/config/plans";
import { NotFoundError, assertOwnership } from "@/lib/ownership";

export class RetryError extends Error {
    constructor(
        message: string,
        // Maps to the HTTP status / tRPC code of the caller
        public readonly reason: "not_found" | "not_retryable" | "limit"
    ) {
        super(message);
        this.name = "RetryError";
    }
}

/**
 * Runs an execution again: the current version of its workflow, from the
 * same trigger, with the data that trigger originally received. This is how
 * a webhook delivery whose run failed is replayed without asking the sender
 * to send it again.
 */
export const retryExecution = async (executionId: string, userId: string) => {
    const found = await prisma.execution.findUnique({
        where: { id: executionId },
        select: {
            id: true,
            status: true,
            workflowId: true,
            trigger: true,
            inputData: true,
            dataDeletedAt: true,
            triggerSource: true,
            workflow: {
                select: { userId: true, user: { select: { plan: true } } },
            },
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
            throw new RetryError(error.message, "not_found");
        }
        throw error;
    }

    if (execution.status === ExecutionStatus.RUNNING) {
        throw new RetryError("This execution is still running.", "not_retryable");
    }

    if (!execution.trigger) {
        throw new RetryError(
            "This execution cannot be retried: it ran before its starting data was being kept.",
            "not_retryable"
        );
    }

    // Without the starting data the run would silently start from nothing
    if (execution.inputData === null) {
        throw new RetryError(
            execution.dataDeletedAt
                ? "This execution cannot be retried: its data was deleted after the retention period."
                : "This execution cannot be retried: its workflow is set not to save run data.",
            "not_retryable"
        );
    }

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const executionsThisMonth = await prisma.execution.count({
        where: { workflow: { userId }, startedAt: { gte: startOfMonth } },
    });

    const limit = PLAN_LIMITS[execution.workflow.user.plan].monthlyExecutions;

    if (executionsThisMonth >= limit) {
        throw new RetryError(
            `Monthly execution limit reached. Your plan includes ${limit} executions per month.`,
            "limit"
        );
    }

    const retried = await prisma.execution.create({
        data: {
            workflowId: execution.workflowId,
            status: ExecutionStatus.RUNNING,
            triggerSource: execution.triggerSource,
        },
    });

    await sendWorkflowExecution({
        workflowId: execution.workflowId,
        executionId: retried.id,
        trigger: execution.trigger,
        InitialData: (execution.inputData ?? {}) as Prisma.JsonObject,
        retryOf: execution.id,
    });

    await prisma.user.update({
        where: { id: userId },
        data: { executionsUsed: { increment: 1 } },
    });

    return { id: retried.id, workflowId: execution.workflowId, retryOf: execution.id };
};
