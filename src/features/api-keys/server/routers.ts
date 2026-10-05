import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { TRPCError } from "@trpc/server";
import z from "zod";
import { generateApiKey, hasApiAccess } from "@/lib/api-keys";

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
                createdAt: true,
                lastUsedAt: true,
            },
        });

        return { items, hasAccess: !!hasApiAccess(user) };
    }),

    // The key itself is only returned here, once
    create: protectedProcedure
        .input(z.object({ name: z.string().trim().min(1, "Name is required").max(60) }))
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
                    message: `You can have up to ${MAX_API_KEYS} API keys. Delete one first.`,
                });
            }

            const { key, keyHash, prefix } = generateApiKey();

            const created = await prisma.apiKey.create({
                data: { name: input.name, keyHash, prefix, userId: user.id },
            });

            return { id: created.id, name: created.name, key };
        }),

    remove: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await prisma.apiKey.delete({
                where: { id: input.id, userId: ctx.auth.user.id },
            });

            return { id: input.id };
        }),
});
