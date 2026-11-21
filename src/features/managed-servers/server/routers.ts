import { TRPCError } from "@trpc/server";
import z from "zod";
import { SELF_HOSTED } from "@/config/self-hosted";
import { isAdmin } from "@/lib/admin";
import { getAppUrl } from "@/lib/app-url";
import { recordAudit } from "@/lib/audit-log";
import prisma from "@/lib/db";
import {
    buildInstallCommand,
    generateInstallToken,
    getServerState,
    isBackupStale,
    isSubscriptionLive,
    unhealthyContainers,
} from "@/lib/managed-server";
import { claimManagedServers } from "@/lib/managed-servers";
import type { Prisma } from "@prisma/client";
import { readOnboardingState } from "@/features/onboarding/lib/checklist";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

// What either page shows of a server. The token hash never leaves the server.
const SERVER_FIELDS = {
    id: true,
    customerEmail: true,
    status: true,
    tokenPrefix: true,
    domain: true,
    version: true,
    installedAt: true,
    lastSeenAt: true,
    lastBackupAt: true,
    health: true,
    createdAt: true,
} as const;

type ServerRow = {
    status: string;
    installedAt: Date | null;
    lastSeenAt: Date | null;
    lastBackupAt: Date | null;
    health: unknown;
};

const describe = <T extends ServerRow>(server: T, now: Date) => ({
    ...server,
    state: getServerState(server, now),
    backupStale: !!server.installedAt && isBackupStale(server.lastBackupAt, now),
    unhealthyContainers: unhealthyContainers(server.health),
});

const notHosted = () =>
    new TRPCError({ code: "NOT_FOUND", message: "A self-hosted server has no managed servers." });

export const managedServersRouter = createTRPCRouter({
    // The signed-in customer's managed servers
    mine: protectedProcedure.query(async ({ ctx }) => {
        if (SELF_HOSTED) return { servers: [] };

        await claimManagedServers(ctx.auth.user);

        const now = new Date();
        const servers = await prisma.managedServer.findMany({
            where: { userId: ctx.auth.user.id },
            orderBy: { createdAt: "asc" },
            select: SERVER_FIELDS,
        });

        return { servers: servers.map((server) => describe(server, now)) };
    }),

    // The server to show the "how to connect your server" popup for: the
    // customer's first paid server that is not installed yet and whose
    // popup they have not closed. Null when there is none.
    welcome: protectedProcedure.query(async ({ ctx }) => {
        if (SELF_HOSTED) return { serverId: null };

        await claimManagedServers(ctx.auth.user);

        const [user, servers] = await Promise.all([
            prisma.user.findUnique({ where: { id: ctx.auth.user.id }, select: { onboarding: true } }),
            prisma.managedServer.findMany({
                where: { userId: ctx.auth.user.id, installedAt: null },
                orderBy: { createdAt: "asc" },
                select: { id: true, status: true },
            }),
        ]);
        const seen = new Set(readOnboardingState(user?.onboarding).managedServerWelcome ?? []);
        const server = servers.find((row) => isSubscriptionLive(row.status) && !seen.has(row.id));

        return { serverId: server?.id ?? null };
    }),

    // The popup was closed: it does not open again for this server
    dismissWelcome: protectedProcedure
        .input(z.object({ serverId: z.string().min(1).max(40) }))
        .mutation(async ({ ctx, input }) => {
            if (SELF_HOSTED) throw notHosted();

            const server = await prisma.managedServer.findFirst({
                where: { id: input.serverId, userId: ctx.auth.user.id },
                select: { id: true },
            });
            if (!server) throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });

            const user = await prisma.user.findUnique({
                where: { id: ctx.auth.user.id },
                select: { onboarding: true },
            });
            const raw = user?.onboarding && typeof user.onboarding === "object" && !Array.isArray(user.onboarding)
                ? (user.onboarding as Record<string, unknown>)
                : {};
            const state = readOnboardingState(raw);
            const welcomed = [...new Set([...(state.managedServerWelcome ?? []), server.id])].slice(-20);

            await prisma.user.update({
                where: { id: ctx.auth.user.id },
                data: { onboarding: { ...raw, managedServerWelcome: welcomed } as Prisma.InputJsonValue },
            });

            return { dismissed: true };
        }),

    // A new install token for one of the customer's servers, shown once.
    // It replaces the old one: a server already installed with the old
    // token stops reporting until the new command is run on it.
    createInstallCommand: protectedProcedure
        .input(
            z.object({
                serverId: z.string().min(1),
                domain: z.string().max(253).optional(),
                email: z.string().max(254).optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            if (SELF_HOSTED) throw notHosted();

            const server = await prisma.managedServer.findFirst({
                where: { id: input.serverId, userId: ctx.auth.user.id },
                select: { id: true, status: true },
            });
            if (!server) throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });

            if (!isSubscriptionLive(server.status)) {
                throw new TRPCError({
                    code: "PRECONDITION_FAILED",
                    message: "This subscription has ended, so it cannot install a server.",
                });
            }

            const { token, tokenHash, tokenPrefix } = generateInstallToken();
            await prisma.managedServer.update({
                where: { id: server.id },
                data: { tokenHash, tokenPrefix },
            });

            await recordAudit({
                userId: ctx.auth.user.id,
                action: "managed_server.install_token_created",
                target: `Private server (${server.id}), token ${tokenPrefix}…`,
            });

            return {
                tokenPrefix,
                command: buildInstallCommand({
                    appUrl: getAppUrl(),
                    token,
                    domain: input.domain,
                    email: input.email,
                }),
            };
        }),

    // Every customer's server, for the platform's admins
    fleet: protectedProcedure.query(async ({ ctx }) => {
        if (SELF_HOSTED) throw notHosted();
        if (!isAdmin(ctx.auth.user)) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Admins only" });
        }

        const now = new Date();
        const servers = await prisma.managedServer.findMany({
            orderBy: [{ status: "asc" }, { createdAt: "desc" }],
            select: { ...SERVER_FIELDS, user: { select: { email: true, name: true } } },
            take: 500,
        });

        return { servers: servers.map((server) => describe(server, now)) };
    }),
});
