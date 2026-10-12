import { TRPCError } from "@trpc/server";
import z from "zod";
import {
    CREDITS_PER_USD,
    INCLUDED_CREDENTIAL_ID,
    INCLUDED_CREDENTIAL_NAME,
    INCLUDED_PROVIDER_OPTIONS,
    PLAN_AI_CREDITS,
    getCreditPacks,
    isIncludedProviderOption,
    parseIncludedModels,
} from "@/config/ai-credits";
import { getChatModelProvider } from "@/features/executions/lib/chat-model-providers";
import { canUseAdminActions, isAdmin } from "@/lib/admin";
import { normalizePriceKey } from "@/lib/ai-cost";
import { getCreditStatus, listIncludedProviders } from "@/lib/ai-credits";
import { describeAuditTarget } from "@/lib/audit-actions";
import { recordAudit } from "@/lib/audit-log";
import prisma from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { createTRPCRouter, protectedProcedure, viewerProcedure } from "@/trpc/init";

// The platform's provider keys are used by every account and paid for by
// the platform: an admin with two-factor on, like the price table
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
    if (!isAdmin(ctx.auth.user)) {
        throw new TRPCError({
            code: "FORBIDDEN",
            message: `Only an admin can set up ${INCLUDED_CREDENTIAL_NAME}.`,
        });
    }

    if (!canUseAdminActions(ctx.auth.user)) {
        throw new TRPCError({
            code: "FORBIDDEN",
            message: `Turn on two-factor authentication in Settings to set up ${INCLUDED_CREDENTIAL_NAME}.`,
        });
    }

    return next();
});

export const aiCreditsRouter = createTRPCRouter({
    // The signed-in user's credits, and the packs on sale
    getStatus: viewerProcedure.query(async ({ ctx }) => {
        const [status, providers] = await Promise.all([
            getCreditStatus(ctx.workspace.ownerId),
            listIncludedProviders(),
        ]);

        return {
            ...status,
            planCredits: PLAN_AI_CREDITS,
            creditsPerUsd: CREDITS_PER_USD,
            // Nothing to show while no admin has set a provider up
            available: providers.length > 0,
            packs: getCreditPacks(),
        };
    }),

    // What "RXJ AI (included)" offers, for the credential and model pickers
    getIncluded: protectedProcedure.query(async () => ({
        credentialId: INCLUDED_CREDENTIAL_ID,
        name: INCLUDED_CREDENTIAL_NAME,
        providers: await listIncludedProviders(),
    })),

    // ADMIN: every provider that was set up. `isAdmin` is false for
    // everyone else, and the list is then empty: the card renders nothing.
    getProviders: viewerProcedure.query(async ({ ctx }) => {
        if (!isAdmin(ctx.auth.user)) {
            return { isAdmin: false, needsTwoFactor: false, options: [], providers: [] };
        }

        const [rows, prices] = await Promise.all([
            prisma.platformAiProvider.findMany({
                orderBy: { provider: "asc" },
                // Never the key
                select: { id: true, provider: true, models: true, enabled: true, updatedAt: true },
            }),
            prisma.modelPrice.findMany({ select: { provider: true, model: true } }),
        ]);

        const priced = new Set(prices.map((price) => `${price.provider}|${price.model}`));

        return {
            isAdmin: true,
            needsTwoFactor: !canUseAdminActions(ctx.auth.user),
            options: INCLUDED_PROVIDER_OPTIONS,
            providers: rows.map((row) => ({
                ...row,
                label: getChatModelProvider(row.provider)?.label ?? row.provider,
                // A model without a price cannot be used: it would be free
                unpricedModels: row.models.filter(
                    (model) =>
                        !priced.has(`${normalizePriceKey(row.provider)}|${normalizePriceKey(model)}`)
                ),
            })),
        };
    }),

    // ADMIN: add a provider, or change its models, its key or whether it
    // is on. An empty key keeps the stored one.
    saveProvider: adminProcedure
        .input(
            z.object({
                provider: z.string().refine(isIncludedProviderOption, "Unknown provider"),
                apiKey: z.string().trim().max(500).optional(),
                models: z.array(z.string().trim().min(1).max(200)).min(1, "Name at least one model").max(50),
                enabled: z.boolean(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const models = parseIncludedModels(input.models);
            const existing = await prisma.platformAiProvider.findUnique({
                where: { provider: input.provider },
                select: { id: true },
            });

            if (!existing && !input.apiKey) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Enter the provider's API key." });
            }

            const saved = await prisma.platformAiProvider.upsert({
                where: { provider: input.provider },
                create: {
                    provider: input.provider,
                    apiKey: encrypt(input.apiKey ?? ""),
                    models,
                    enabled: input.enabled,
                },
                update: {
                    models,
                    enabled: input.enabled,
                    ...(input.apiKey ? { apiKey: encrypt(input.apiKey) } : {}),
                },
                select: { id: true, provider: true },
            });

            await recordAudit({
                userId: ctx.auth.user.id,
                action: "included_ai.saved",
                target:
                    describeAuditTarget("Included AI provider", { name: saved.provider, id: saved.id }) +
                    (input.apiKey ? ", key replaced" : "") +
                    (input.enabled ? "" : ", switched off"),
            });

            return { id: saved.id, provider: saved.provider };
        }),

    // ADMIN: nodes that use the provider stop with a message that says so
    deleteProvider: adminProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const deleted = await prisma.platformAiProvider.delete({
                where: { id: input.id },
                select: { id: true, provider: true },
            });

            await recordAudit({
                userId: ctx.auth.user.id,
                action: "included_ai.deleted",
                target: describeAuditTarget("Included AI provider", { name: deleted.provider, id: deleted.id }),
            });

            return { id: deleted.id };
        }),
});
