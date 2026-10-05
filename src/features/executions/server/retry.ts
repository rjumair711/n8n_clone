import { ExecutionStatus, type Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { sendWorkflowExecution } from "@/inngest/utils";
import { PLAN_LIMITS } from "@/config/plans";

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
    const execution = await prisma.execution.findFirst({
        // Scoped to the owner
        where: { id: executionId, workflow: { userId } },
        select: {
            id: true,
            status: true,
            workflowId: true,
            trigger: true,
            inputData: true,
            triggerSource: true,
            workflow: { select: { user: { select: { plan: true } } } },
        },
    });

    if (!execution) {
        throw new RetryError("Execution not found.", "not_found");
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
