import { TRPCError } from "@trpc/server";
import z from "zod";
import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { canUseAdminActions, isAdmin } from "@/lib/admin";
import { assertOwnership } from "@/lib/ownership";
import { describeAuditTarget } from "@/lib/audit-actions";
import { recordAudit } from "@/lib/audit-log";
import {
    MAX_BUDGET_USD,
    normalizePriceKey,
    parseBudgetCents,
    roundCost,
    startOfUtcMonth,
    summarizeExecutionUsage,
} from "@/lib/ai-cost";

// The price table decides what every account's runs cost and when their
// budgets stop them: an admin with two-factor on, like the templates
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
    if (!isAdmin(ctx.auth.user)) {
        throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only an admin can change model prices.",
        });
    }

    if (!canUseAdminActions(ctx.auth.user)) {
        throw new TRPCError({
            code: "FORBIDDEN",
            message: "Turn on two-factor authentication in Settings to change model prices.",
        });
    }

    return next();
});

// US dollars per million tokens
const MAX_PRICE_PER_M = 100_000;
const rate = z.number().min(0).max(MAX_PRICE_PER_M);

// How far back "used without a price" looks
const UNPRICED_LOOKBACK_DAYS = 30;

// Null removes the budget
const budgetInput = z
    .number()
    .min(0.01, "A budget is at least $0.01")
    .max(MAX_BUDGET_USD, `A budget is at most $${MAX_BUDGET_USD.toLocaleString("en-US")}`)
    .nullable();

const toBudgetCents = (budgetUsd: number | null) => {
    const cents = parseBudgetCents(budgetUsd);

    if (cents === undefined) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That is not a valid budget." });
    }

    return cents;
};

const toPrice = (price: {
    id: string;
    provider: string;
    model: string;
    inputPerM: unknown;
    outputPerM: unknown;
    cachedInputPerM: unknown;
    updatedAt: Date;
}) => ({
    id: price.id,
    provider: price.provider,
    model: price.model,
    inputPerM: Number(price.inputPerM),
    outputPerM: Number(price.outputPerM),
    cachedInputPerM: price.cachedInputPerM === null ? null : Number(price.cachedInputPerM),
    updatedAt: price.updatedAt,
});

export const aiUsageRouter = createTRPCRouter({
    // The model calls of one execution: a line per node and model, and the total
    getExecution: protectedProcedure
        .input(z.object({ executionId: z.string() }))
        .query(async ({ ctx, input }) => {
            assertOwnership(
                await prisma.execution.findUnique({
                    where: { id: input.executionId },
                    select: { workflow: { select: { userId: true } } },
                }),
                ctx.auth.user.id,
                "Execution",
                (execution) => execution.workflow.userId
            );

            const rows = await prisma.aiUsage.findMany({
                where: { executionId: input.executionId, userId: ctx.auth.user.id },
                orderBy: { createdAt: "asc" },
                select: {
                    nodeId: true,
                    nodeName: true,
                    provider: true,
                    model: true,
                    inputTokens: true,
                    outputTokens: true,
                    cachedInputTokens: true,
                    costUsd: true,
                },
            });

            return summarizeExecutionUsage(
                rows.map((row) => ({
                    ...row,
                    costUsd: row.costUsd === null ? null : Number(row.costUsd),
                }))
            );
        }),

    // This month's AI spend of the account, per workflow, with the budgets
    getMonthly: protectedProcedure.query(async ({ ctx }) => {
        const userId = ctx.auth.user.id;
        const since = startOfUtcMonth();
        const where = { userId, createdAt: { gte: since } };

        const [user, total, unpricedCalls, perWorkflow, budgeted] = await Promise.all([
            prisma.user.findUniqueOrThrow({
                where: { id: userId },
                select: { aiBudgetCents: true },
            }),
            prisma.aiUsage.aggregate({
                where,
                _count: { _all: true },
                _sum: {
                    costUsd: true,
                    inputTokens: true,
                    outputTokens: true,
                    cachedInputTokens: true,
                },
            }),
            prisma.aiUsage.count({ where: { ...where, costUsd: null } }),
            prisma.aiUsage.groupBy({
                by: ["workflowId"],
                where,
                _count: { _all: true },
                _sum: { costUsd: true },
            }),
            // A workflow with a budget is listed even before it spends
            prisma.workflow.findMany({
                where: { userId, aiBudgetCents: { not: null } },
                select: { id: true },
            }),
        ]);

        const workflowIds = [
            ...new Set([
                ...perWorkflow.flatMap((row) => (row.workflowId ? [row.workflowId] : [])),
                ...budgeted.map((workflow) => workflow.id),
            ]),
        ];

        const workflows = await prisma.workflow.findMany({
            where: { id: { in: workflowIds }, userId },
            select: { id: true, name: true, aiBudgetCents: true },
        });

        const spend = new Map(perWorkflow.map((row) => [row.workflowId, row]));

        const listed = workflows
            .map((workflow) => ({
                workflowId: workflow.id as string | null,
                name: workflow.name,
                budgetCents: workflow.aiBudgetCents,
                calls: spend.get(workflow.id)?._count._all ?? 0,
                costUsd: roundCost(Number(spend.get(workflow.id)?._sum.costUsd ?? 0)),
            }))
            .sort((a, b) => b.costUsd - a.costUsd || a.name.localeCompare(b.name));

        // What deleted workflows spent still counts towards the month
        const known = new Set(workflows.map((workflow) => workflow.id));
        const gone = perWorkflow.filter((row) => !row.workflowId || !known.has(row.workflowId));

        if (gone.length > 0) {
            listed.push({
                workflowId: null,
                name: "Deleted workflows",
                budgetCents: null,
                calls: gone.reduce((sum, row) => sum + row._count._all, 0),
                costUsd: roundCost(gone.reduce((sum, row) => sum + Number(row._sum.costUsd ?? 0), 0)),
            });
        }

        return {
            since,
            budgetCents: user.aiBudgetCents,
            calls: total._count._all,
            unpricedCalls,
            costUsd: roundCost(Number(total._sum.costUsd ?? 0)),
            inputTokens: total._sum.inputTokens ?? 0,
            outputTokens: total._sum.outputTokens ?? 0,
            cachedInputTokens: total._sum.cachedInputTokens ?? 0,
            workflows: listed,
        };
    }),

    // The account's monthly AI budget, over all its workflows
    setUserBudget: protectedProcedure
        .input(z.object({ budgetUsd: budgetInput }))
        .mutation(async ({ ctx, input }) => {
            const user = await prisma.user.update({
                where: { id: ctx.auth.user.id },
                data: { aiBudgetCents: toBudgetCents(input.budgetUsd) },
                select: { aiBudgetCents: true },
            });

            return { budgetCents: user.aiBudgetCents };
        }),

    getWorkflowBudget: protectedProcedure
        .input(z.object({ workflowId: z.string() }))
        .query(async ({ ctx, input }) => {
            const workflow = assertOwnership(
                await prisma.workflow.findUnique({
                    where: { id: input.workflowId },
                    select: { userId: true, aiBudgetCents: true },
                }),
                ctx.auth.user.id,
                "Workflow"
            );

            const spent = await prisma.aiUsage.aggregate({
                where: {
                    userId: ctx.auth.user.id,
                    workflowId: input.workflowId,
                    createdAt: { gte: startOfUtcMonth() },
                },
                _sum: { costUsd: true },
            });

            return {
                budgetCents: workflow.aiBudgetCents,
                spentUsd: roundCost(Number(spent._sum.costUsd ?? 0)),
            };
        }),

    setWorkflowBudget: protectedProcedure
        .input(z.object({ workflowId: z.string(), budgetUsd: budgetInput }))
        .mutation(async ({ ctx, input }) => {
            assertOwnership(
                await prisma.workflow.findUnique({
                    where: { id: input.workflowId },
                    select: { userId: true },
                }),
                ctx.auth.user.id,
                "Workflow"
            );

            const workflow = await prisma.workflow.update({
                where: { id: input.workflowId, userId: ctx.auth.user.id },
                data: { aiBudgetCents: toBudgetCents(input.budgetUsd) },
                select: { id: true, name: true, aiBudgetCents: true },
            });

            return {
                workflowId: workflow.id,
                name: workflow.name,
                budgetCents: workflow.aiBudgetCents,
            };
        }),

    // ADMIN: the price table, and the models that ran without a price
    getPrices: adminProcedure.query(async () => {
        const [prices, used] = await Promise.all([
            prisma.modelPrice.findMany({
                orderBy: [{ provider: "asc" }, { model: "asc" }],
            }),
            prisma.aiUsage.groupBy({
                by: ["provider", "model"],
                where: {
                    costUsd: null,
                    createdAt: {
                        gte: new Date(Date.now() - UNPRICED_LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
                    },
                },
                _count: { _all: true },
            }),
        ]);

        const priced = new Set(
            prices.map((price) => JSON.stringify([price.provider, price.model]))
        );

        // Model names keep the case they were typed in: one line per price key
        const unpriced = new Map<string, { provider: string; model: string; calls: number }>();

        for (const row of used) {
            const provider = normalizePriceKey(row.provider);
            const model = normalizePriceKey(row.model);
            const key = JSON.stringify([provider, model]);
            if (!model || priced.has(key)) continue;

            const entry = unpriced.get(key) ?? { provider, model, calls: 0 };
            entry.calls += row._count._all;
            unpriced.set(key, entry);
        }

        return {
            prices: prices.map(toPrice),
            unpriced: [...unpriced.values()].sort((a, b) => b.calls - a.calls).slice(0, 50),
            unpricedDays: UNPRICED_LOOKBACK_DAYS,
        };
    }),

    // Adds the price of a model, or replaces it. Calls made before keep the
    // cost they were recorded with.
    savePrice: adminProcedure
        .input(
            z.object({
                provider: z.string().trim().min(1, "Provider is required").max(60),
                model: z.string().trim().min(1, "Model is required").max(200),
                inputPerM: rate,
                outputPerM: rate,
                cachedInputPerM: rate.nullable(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const provider = normalizePriceKey(input.provider);
            const model = normalizePriceKey(input.model);

            const rates = {
                inputPerM: input.inputPerM,
                outputPerM: input.outputPerM,
                cachedInputPerM: input.cachedInputPerM,
            };

            const price = await prisma.modelPrice.upsert({
                where: { provider_model: { provider, model } },
                create: { provider, model, ...rates },
                update: rates,
            });

            await recordAudit({
                userId: ctx.auth.user.id,
                action: "model_price.saved",
                target: describeAuditTarget("Model price", {
                    name: `${provider} / ${model}`,
                    id: price.id,
                }),
            });

            return toPrice(price);
        }),

    deletePrice: adminProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const price = await prisma.modelPrice.findUnique({ where: { id: input.id } });

            if (!price) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Model price not found." });
            }

            await prisma.modelPrice.delete({ where: { id: price.id } });

            await recordAudit({
                userId: ctx.auth.user.id,
                action: "model_price.deleted",
                target: describeAuditTarget("Model price", {
                    name: `${price.provider} / ${price.model}`,
                    id: price.id,
                }),
            });

            return { id: price.id };
        }),
});
