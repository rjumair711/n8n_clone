import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { TRPCError } from "@trpc/server";
import z from "zod";
import { generateApiKey, hasApiAccess } from "@/lib/api-keys";
import { assertOwnership } from "@/lib/ownership";
import { describeAuditTarget } from "@/lib/audit-actions";
import { recordAudit } from "@/lib/audit-log";
import {
    API_SCOPES,
    normalizeScopes,
    parseExpiryDate,
} from "@/lib/api-key-scopes";

const MAX_API_KEYS = 10;

export const apiKeysRouter = createTRPCRouter({
    getMany: protectedProcedure.query(async ({ ctx }) => {
        const user = await prisma.user.findUniqueOrThrow({
            where: { id: ctx.auth.user.id },
            select: { plan: true, trialEndsAt: true },
        });

        const items = await prisma.apiKey.findMany({
            where: { userId: ctx.auth.user.id },
            orderBy: { createdAt: "desc" },
            // The hash never leaves the server
            select: {
                id: true,
                name: true,
                prefix: true,
                scopes: true,
                expiresAt: true,
                createdAt: true,
                lastUsedAt: true,
            },
        });

        return { items, hasAccess: !!hasApiAccess(user) };
    }),

    // The key itself is only returned here, once
    create: protectedProcedure
        .input(
            z.object({
                name: z.string().trim().min(1, "Name is required").max(60),
                scopes: z.array(z.enum(API_SCOPES)).min(1, "Pick at least one scope"),
                // A date like 2026-12-31; empty for a key that never expires
                expiresOn: z.string().trim().optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const user = await prisma.user.findUniqueOrThrow({
                where: { id: ctx.auth.user.id },
            });

            if (!hasApiAccess(user)) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "API access requires the Pro plan.",
                });
            }

            const count = await prisma.apiKey.count({
                where: { userId: user.id },
            });

            if (count >= MAX_API_KEYS) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: `You can have up to ${MAX_API_KEYS} API keys. Revoke one first.`,
                });
            }

            let expiresAt: Date | null;
            try {
                expiresAt = parseExpiryDate(input.expiresOn);
            } catch (error) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: (error as Error).message,
                });
            }

            const { key, keyHash, prefix } = generateApiKey();

            const created = await prisma.apiKey.create({
                data: {
                    name: input.name,
                    keyHash,
                    prefix,
                    scopes: normalizeScopes(input.scopes),
                    expiresAt,
                    userId: user.id,
                },
            });

            await recordAudit({
                userId: user.id,
                action: "api_key.created",
                // The prefix is what the key list shows. The key itself is
                // only ever returned once, below.
                target: describeAuditTarget("API key", {
                    name: `${created.name} [${created.prefix}...]`,
                    id: created.id,
                }),
            });

            return { id: created.id, name: created.name, key };
        }),

    remove: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const apiKey = assertOwnership(
                await prisma.apiKey.findUnique({
                    where: { id: input.id },
                    select: { userId: true, name: true, prefix: true },
                }),
                ctx.auth.user.id,
                "API key"
            );

            await prisma.apiKey.delete({
                where: { id: input.id, userId: ctx.auth.user.id },
            });

            await recordAudit({
                userId: ctx.auth.user.id,
                action: "api_key.revoked",
                target: describeAuditTarget("API key", {
                    name: `${apiKey.name} [${apiKey.prefix}...]`,
                    id: input.id,
                }),
            });

            return { id: input.id };
        }),
});
