import { TRPCError } from "@trpc/server";
import { headers } from "next/headers";
import z from "zod";
import prisma from "@/lib/db";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { assertOwnership } from "@/lib/ownership";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { describeUserAgent } from "../lib/user-agent";

export const settingsRouter = createTRPCRouter({
    // What the Security section needs to know about the account
    getSecurity: protectedProcedure.query(async ({ ctx }) => {
        const user = await prisma.user.findUnique({
            where: { id: ctx.auth.user.id },
            select: {
                twoFactorEnabled: true,
                accounts: { where: { providerId: "credential" }, select: { id: true } },
            },
        });

        return {
            twoFactorEnabled: user?.twoFactorEnabled === true,
            // Google and GitHub accounts have no password to confirm with
            hasPassword: (user?.accounts.length ?? 0) > 0,
            isAdmin: isAdmin(ctx.auth.user),
        };
    }),

    // The account's sessions that have not expired, latest first. The
    // session tokens stay on the server: a session is named by its id.
    getSessions: protectedProcedure.query(async ({ ctx }) => {
        const sessions = await prisma.session.findMany({
            where: { userId: ctx.auth.user.id, expiresAt: { gt: new Date() } },
            orderBy: { updatedAt: "desc" },
            select: {
                id: true,
                ipAddress: true,
                userAgent: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        return sessions.map((session) => ({
            id: session.id,
            device: describeUserAgent(session.userAgent),
            ipAddress: session.ipAddress || null,
            createdAt: session.createdAt,
            // Better Auth touches a session when it refreshes it
            lastActiveAt: session.updatedAt,
            isCurrent: session.id === ctx.auth.session.id,
        }));
    }),

    // Signs one other session out
    revokeSession: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const session = assertOwnership(
                await prisma.session.findUnique({
                    where: { id: input.id },
                    select: { id: true, token: true, userId: true },
                }),
                ctx.auth.user.id,
                "Session"
            );

            if (session.id === ctx.auth.session.id) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "This is the session you are using. Use Sign out instead.",
                });
            }

            await auth.api.revokeSession({
                headers: await headers(),
                body: { token: session.token },
            });

            return { id: session.id };
        }),

    // Signs out everywhere except here
    revokeOtherSessions: protectedProcedure.mutation(async () => {
        await auth.api.revokeOtherSessions({ headers: await headers() });

        return { success: true };
    }),
});
