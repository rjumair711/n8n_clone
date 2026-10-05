import { ExecutionStatus, NodeType, Prisma } from "@prisma/client";
import { inngest } from "./client";
import { TRIGGER_TYPE_SOURCES } from "@/config/trigger-sources";
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
    callDepth,
    dedupeKey,
}: {
    workflowId: string;
    trigger: NodeType;
    initialData: Record<string, unknown>;
    // Set by the Execute Workflow node to stop endless recursion
    callDepth?: number;
    // The provider's id for this event (a Stripe event id, a WhatsApp
    // message id, an Idempotency-Key header...). An event that was already
    // accepted for this workflow does not start a second run.
    dedupeKey?: string | number | null;
}): Promise<{ id: string; duplicate: boolean }> => {
    const key =
        dedupeKey === undefined || dedupeKey === null || dedupeKey === ""
            ? null
            : String(dedupeKey).slice(0, 255);

    let deliveryId: string | null = null;

    if (key) {
        try {
            const delivery = await prisma.webhookDelivery.create({
                data: { workflowId, source: trigger, key },
            })
            deliveryId = delivery.id
        } catch (error) {
            // The unique index is the check, so two deliveries arriving at
            // the same moment cannot both pass
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === "P2002"
            ) {
                const existing = await prisma.webhookDelivery.findUnique({
                    where: {
                        workflowId_source_key: { workflowId, source: trigger, key },
                    },
                })

                return { id: existing?.executionId ?? "", duplicate: true }
            }

            throw error
        }
    }

    try {
        const execution = await prisma.execution.create({
            data: {
                workflowId,
                status: ExecutionStatus.RUNNING,
                triggerSource: TRIGGER_TYPE_SOURCES[trigger],
            },
        })

        await sendWorkflowExecution({
            workflowId,
            executionId: execution.id,
            trigger,
            InitialData: initialData,
            ...(callDepth ? { callDepth } : {}),
        })

        if (deliveryId) {
            await prisma.webhookDelivery.update({
                where: { id: deliveryId },
                data: { executionId: execution.id },
            })
        }

        return { id: execution.id, duplicate: false }
    } catch (error) {
        // The run never started: forget the delivery so the provider's
        // retry is accepted
        if (deliveryId) {
            await prisma.webhookDelivery
                .delete({ where: { id: deliveryId } })
                .catch(() => {})
        }

        throw error
    }
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

const DELIVERY_RETENTION_DAYS = 7

// Providers stop re-sending an event after a few days at most
export const deleteOldWebhookDeliveries = async () => {
    const cutoff = new Date(Date.now() - DELIVERY_RETENTION_DAYS * 24 * 60 * 60 * 1000)

    const deleted = await prisma.webhookDelivery.deleteMany({
        where: { createdAt: { lt: cutoff } },
    })

    return deleted.count
}
