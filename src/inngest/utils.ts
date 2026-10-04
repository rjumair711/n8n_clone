import { ExecutionStatus, NodeType } from "@prisma/client";
import { inngest } from "./client";
import { createId } from "@paralleldrive/cuid2";
import prisma from "@/lib/db";

export const sendWorkflowExecution = async (data: {
    workflowId: string;
    executionId: string;
    [key: string]: any;
}) => {
    return inngest.send({
        name: "workflows/execute.workflow",
        data,
        id: createId()
    })
}

// Used by the webhook routes: the engine needs an Execution row to exist
// before the event arrives.
export const startWorkflowExecution = async ({
    workflowId,
    trigger,
    initialData,
}: {
    workflowId: string;
    trigger: NodeType;
    initialData: Record<string, unknown>;
}) => {
    const execution = await prisma.execution.create({
        data: {
            workflowId,
            status: ExecutionStatus.RUNNING,
        },
    })

    await sendWorkflowExecution({
        workflowId,
        executionId: execution.id,
        trigger,
        InitialData: initialData,
    })

    return execution
}

// Returns the workflow's trigger nodes of the given type (empty when the
// workflow does not exist, is inactive, or is not listening for this trigger).
export const findTriggerNodes = async (
    workflowId: string,
    trigger: NodeType,
) => {
    return prisma.node.findMany({
        where: {
            workflowId,
            type: trigger,
            workflow: { active: true },
        },
    })
}
