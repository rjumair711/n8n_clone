import "server-only";

import { NonRetriableError } from "inngest";
import {
    aiBudgetError,
    computeCostUsd,
    isBudgetUsedUp,
    normalizePriceKey,
    startOfUtcMonth,
    type TokenUsage,
} from "./ai-cost";
import prisma from "./db";
import {
    sumCallsByModel,
    type ModelTracker,
} from "@/features/executions/lib/model-fallback";

// Where a model call was made. Taken from the executor's parameters.
export type AiUsageScope = {
    userId: string;
    workflowId?: string;
    // Absent in unit tests: nothing is recorded or checked then
    executionId?: string;
    nodeId?: string;
    nodeName?: string;
};

export const getAiUsageScope = (params: {
    userId: string;
    workflowId?: string;
    executionId?: string;
    nodeId: string;
    allNodes?: { id: string; name: string }[];
}): AiUsageScope => ({
    userId: params.userId,
    workflowId: params.workflowId,
    executionId: params.executionId,
    nodeId: params.nodeId,
    nodeName: params.allNodes?.find((node) => node.id === params.nodeId)?.name,
});

/**
 * Writes down one model call: its tokens and what they cost at the price
 * set right now. Call it inside the step that made the call, so a replayed
 * run does not count it twice.
 *
 * Never throws: a call that could not be written down must not fail the
 * node, which would make it call the model (and pay) again.
 */
export const recordAiUsage = async ({
    scope,
    provider,
    model,
    kind = "chat",
    usage,
}: {
    scope: AiUsageScope;
    provider: string;
    model: string;
    kind?: "chat" | "embedding";
    usage: TokenUsage;
}) => {
    if (!scope.executionId) return;

    try {
        const providerKey = normalizePriceKey(provider) || "unknown";
        const modelName = model.trim();

        const price = await prisma.modelPrice.findUnique({
            where: {
                provider_model: {
                    provider: providerKey,
                    model: normalizePriceKey(modelName),
                },
            },
        });

        const costUsd = computeCostUsd(
            usage,
            price && {
                inputPerM: Number(price.inputPerM),
                outputPerM: Number(price.outputPerM),
                cachedInputPerM:
                    price.cachedInputPerM === null ? null : Number(price.cachedInputPerM),
            }
        );

        await prisma.aiUsage.create({
            data: {
                userId: scope.userId,
                workflowId: scope.workflowId,
                executionId: scope.executionId,
                nodeId: scope.nodeId,
                nodeName: scope.nodeName,
                kind,
                provider: providerKey,
                model: modelName,
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                cachedInputTokens: usage.cachedInputTokens,
                costUsd,
            },
        });
    } catch (error) {
        console.error(
            "[RXJ] Could not record AI usage:",
            error instanceof Error ? error.message : error
        );
    }
};

/**
 * Writes down what a node's model calls used, one line per model that
 * answered: with fallbacks or a Model Router that can be more than one, and
 * each has its own price. Like recordAiUsage, it never throws.
 */
export const recordModelCalls = async (scope: AiUsageScope, tracker: ModelTracker) => {
    for (const { provider, model, usage } of sumCallsByModel(tracker)) {
        await recordAiUsage({ scope, provider, model, usage });
    }
};

const getMonthSpendUsd = async (where: { userId: string; workflowId?: string }) => {
    const sum = await prisma.aiUsage.aggregate({
        where: { ...where, createdAt: { gte: startOfUtcMonth() } },
        _sum: { costUsd: true },
    });

    return Number(sum._sum.costUsd ?? 0);
};

/**
 * Stops a node that is about to call a model when the workflow's or the
 * account's monthly AI budget is used up. Without a budget nothing is read
 * but the two budget fields.
 *
 * It is checked before each AI node, not during one, so the month can end
 * up over the budget by what the last node cost. Calls without a price
 * count as nothing.
 */
export const assertAiBudget = async ({
    userId,
    workflowId,
    executionId,
}: Pick<AiUsageScope, "userId" | "workflowId" | "executionId">) => {
    if (!executionId) return;

    const [user, workflow] = await Promise.all([
        prisma.user.findUnique({
            where: { id: userId },
            select: { aiBudgetCents: true },
        }),
        workflowId
            ? prisma.workflow.findUnique({
                  where: { id: workflowId },
                  select: { name: true, aiBudgetCents: true },
              })
            : null,
    ]);

    if (workflow && workflowId && workflow.aiBudgetCents !== null) {
        const spentUsd = await getMonthSpendUsd({ userId, workflowId });

        if (isBudgetUsedUp(spentUsd, workflow.aiBudgetCents)) {
            throw new NonRetriableError(
                aiBudgetError({
                    scope: "workflow",
                    workflowName: workflow.name,
                    spentUsd,
                    budgetCents: workflow.aiBudgetCents,
                })
            );
        }
    }

    if (user && user.aiBudgetCents !== null) {
        const spentUsd = await getMonthSpendUsd({ userId });

        if (isBudgetUsedUp(spentUsd, user.aiBudgetCents)) {
            throw new NonRetriableError(
                aiBudgetError({
                    scope: "account",
                    spentUsd,
                    budgetCents: user.aiBudgetCents,
                })
            );
        }
    }
};
