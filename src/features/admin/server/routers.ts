import { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { Resend } from "resend";
import z from "zod";
import { canUseAdminActions, isAdmin } from "@/lib/admin";
import { getAppUrl } from "@/lib/app-url";
import { recordAudit } from "@/lib/audit-log";
import prisma from "@/lib/db";
import {
    SUPPORT_REPLY_MAX,
    SUPPORT_STATUSES,
    buildSupportReplyEmail,
} from "@/lib/support";
import { getServerState } from "@/lib/managed-server";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

const DAY_MS = 24 * 60 * 60 * 1000;

// Looking needs an admin (a verified address in ADMIN_EMAILS)
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
    if (!isAdmin(ctx.auth.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admins only" });
    }
    return next();
});

// Changing anything also needs two-factor on the admin's account
const adminActionProcedure = adminProcedure.use(({ ctx, next }) => {
    if (!canUseAdminActions(ctx.auth.user)) {
        throw new TRPCError({
            code: "FORBIDDEN",
            message: "Turn on two-factor authentication in Settings to answer support messages.",
        });
    }
    return next();
});

const startOfMonthUtc = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

const statusSchema = z.enum(SUPPORT_STATUSES);

// The Customers page lists at most this many accounts (the busiest first)
const CUSTOMERS_MAX = 500;

export const adminRouter = createTRPCRouter({
    // The Overview tiles
    overview: adminProcedure.query(async ({ ctx }) => {
        const now = new Date();
        const [newSupport, openSupport, accounts, signups, activeWorkflows, runs, failedRuns] =
            await Promise.all([
                prisma.supportMessage.count({ where: { status: "new" } }),
                prisma.supportMessage.count({ where: { status: { in: ["new", "in_progress"] } } }),
                prisma.user.count(),
                prisma.user.count({ where: { createdAt: { gt: new Date(now.getTime() - 7 * DAY_MS) } } }),
                prisma.workflow.count({ where: { active: true } }),
                prisma.executionUsage.aggregate({
                    where: { month: startOfMonthUtc(now) },
                    _sum: { count: true },
                }),
                prisma.execution.count({
                    where: { status: "FAILED", startedAt: { gt: new Date(now.getTime() - DAY_MS) } },
                }),
            ]);

        return {
            newSupport,
            openSupport,
            accounts,
            signupsThisWeek: signups,
            activeWorkflows,
            runsThisMonth: runs._sum.count ?? 0,
            failedRunsLast24h: failedRuns,
            // So the page can say up front that answering needs two-factor
            canAct: canUseAdminActions(ctx.auth.user),
        };
    }),

    // Every account with what it does, busiest first (most runs this
    // month). Up to CUSTOMERS_MAX accounts that match the search.
    customers: adminProcedure
        .input(z.object({ search: z.string().trim().max(100).optional() }).default({}))
        .query(async ({ input }) => {
            const now = new Date();
            const month = startOfMonthUtc(now);
            const search = input.search || undefined;

            const users = await prisma.user.findMany({
                where: search
                    ? {
                          OR: [
                              { email: { contains: search, mode: "insensitive" } },
                              { name: { contains: search, mode: "insensitive" } },
                          ],
                      }
                    : {},
                orderBy: { createdAt: "desc" },
                take: CUSTOMERS_MAX,
                select: { id: true, name: true, email: true, createdAt: true, emailVerified: true },
            });
            const ids = users.map((user) => user.id);
            if (!ids.length) return { customers: [], capped: false };

            const [workflows, active, usage, failed, sessions, support, servers] = await Promise.all([
                prisma.workflow.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _count: { _all: true } }),
                prisma.workflow.groupBy({
                    by: ["userId"],
                    where: { userId: { in: ids }, active: true },
                    _count: { _all: true },
                }),
                prisma.executionUsage.findMany({
                    where: { userId: { in: ids }, month },
                    select: { userId: true, count: true },
                }),
                // Failed runs this month, per workflow owner (uses the
                // status + startedAt index)
                prisma.$queryRaw<{ userId: string; count: bigint }[]>`
                    SELECT w."userId", COUNT(*)::bigint AS count
                    FROM "Execution" e
                    JOIN "Workflow" w ON w."id" = e."workflowId"
                    WHERE e."status" = 'FAILED' AND e."startedAt" >= ${month}
                      AND w."userId" IN (${Prisma.join(ids)})
                    GROUP BY w."userId"
                `,
                prisma.session.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _max: { updatedAt: true } }),
                prisma.supportMessage.groupBy({
                    by: ["userId"],
                    where: { userId: { in: ids }, status: { in: ["new", "in_progress"] } },
                    _count: { _all: true },
                }),
                prisma.managedServer.findMany({
                    where: { userId: { in: ids } },
                    select: { userId: true, status: true, installedAt: true, lastSeenAt: true },
                }),
            ]);

            const byUser = <T extends { userId: string | null }>(rows: T[]) =>
                new Map(rows.map((row) => [row.userId as string, row]));
            const workflowCount = byUser(workflows);
            const activeCount = byUser(active);
            const runs = byUser(usage);
            const failedCount = byUser(failed);
            const lastSeen = byUser(sessions);
            const openSupport = byUser(support);

            const customers = users
                .map((user) => {
                    const own = servers.filter((server) => server.userId === user.id);
                    return {
                        ...user,
                        workflows: workflowCount.get(user.id)?._count._all ?? 0,
                        activeWorkflows: activeCount.get(user.id)?._count._all ?? 0,
                        runsThisMonth: runs.get(user.id)?.count ?? 0,
                        failedRunsThisMonth: Number(failedCount.get(user.id)?.count ?? 0),
                        lastSignInAt: lastSeen.get(user.id)?._max.updatedAt ?? null,
                        openSupport: openSupport.get(user.id)?._count._all ?? 0,
                        servers: own.map((server) => getServerState(server, now)),
                    };
                })
                .sort(
                    (a, b) =>
                        b.runsThisMonth - a.runsThisMonth ||
                        b.activeWorkflows - a.activeWorkflows ||
                        b.createdAt.getTime() - a.createdAt.getTime()
                );

            return { customers, capped: users.length === CUSTOMERS_MAX };
        }),

    // One account: its workflows, latest failed runs, servers and messages.
    // Names, types and error messages only: never node settings,
    // credentials or run data.
    customer: adminProcedure
        .input(z.object({ userId: z.string().min(1).max(40) }))
        .query(async ({ input }) => {
            const user = await prisma.user.findUnique({
                where: { id: input.userId },
                select: { id: true, name: true, email: true, emailVerified: true, createdAt: true },
            });
            if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });

            const [workflows, failedRuns, servers, messages] = await Promise.all([
                prisma.workflow.findMany({
                    where: { userId: user.id },
                    orderBy: { updatedAt: "desc" },
                    take: 100,
                    select: {
                        id: true,
                        name: true,
                        active: true,
                        updatedAt: true,
                        _count: { select: { nodes: true } },
                    },
                }),
                prisma.execution.findMany({
                    where: { status: "FAILED", workflow: { userId: user.id } },
                    orderBy: { startedAt: "desc" },
                    take: 10,
                    select: {
                        id: true,
                        startedAt: true,
                        error: true,
                        workflow: { select: { name: true } },
                        nodes: {
                            where: { status: "FAILED" },
                            take: 1,
                            select: { nodeName: true, nodeType: true, error: true },
                        },
                    },
                }),
                prisma.managedServer.findMany({
                    where: { userId: user.id },
                    select: {
                        id: true,
                        domain: true,
                        status: true,
                        installedAt: true,
                        lastSeenAt: true,
                        createdAt: true,
                    },
                }),
                prisma.supportMessage.findMany({
                    where: { userId: user.id },
                    orderBy: { createdAt: "desc" },
                    take: 20,
                    select: { id: true, title: true, status: true, createdAt: true },
                }),
            ]);

            const now = new Date();
            return {
                user,
                workflows: workflows.map(({ _count, ...workflow }) => ({ ...workflow, nodes: _count.nodes })),
                failedRuns: failedRuns.map((run) => ({
                    id: run.id,
                    startedAt: run.startedAt,
                    workflowName: run.workflow.name,
                    node: run.nodes[0] ? { name: run.nodes[0].nodeName, type: run.nodes[0].nodeType } : null,
                    error: (run.nodes[0]?.error ?? run.error)?.slice(0, 1000) ?? null,
                })),
                servers: servers.map((server) => ({ ...server, state: getServerState(server, now) })),
                messages,
            };
        }),

    // The support inbox, newest first
    supportList: adminProcedure
        .input(z.object({ status: statusSchema.optional() }).default({}))
        .query(async ({ input }) => {
            const messages = await prisma.supportMessage.findMany({
                where: input.status ? { status: input.status } : {},
                orderBy: { createdAt: "desc" },
                take: 200,
                select: {
                    id: true,
                    title: true,
                    name: true,
                    email: true,
                    workflowName: true,
                    nodeName: true,
                    status: true,
                    createdAt: true,
                    _count: { select: { replies: true } },
                },
            });

            return messages.map(({ _count, ...message }) => ({ ...message, replyCount: _count.replies }));
        }),

    // One message: what was sent, the replies, and read-only details of the
    // workflow (node names and types, whether a node uses a credential,
    // the last failed run's failing node and error). Never node settings
    // or credential values.
    supportMessage: adminProcedure
        .input(z.object({ id: z.string().min(1).max(40) }))
        .query(async ({ input }) => {
            const message = await prisma.supportMessage.findUnique({
                where: { id: input.id },
                include: {
                    user: { select: { id: true, email: true, name: true, createdAt: true } },
                    replies: {
                        orderBy: { createdAt: "asc" },
                        select: {
                            id: true,
                            text: true,
                            createdAt: true,
                            admin: { select: { name: true } },
                        },
                    },
                },
            });
            if (!message) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });

            const workflow = message.workflowId
                ? await prisma.workflow.findFirst({
                      // Checked to be the sender's workspace's when it was sent
                      where: { id: message.workflowId },
                      select: {
                          id: true,
                          name: true,
                          active: true,
                          updatedAt: true,
                          nodes: {
                              orderBy: { createdAt: "asc" },
                              select: { id: true, name: true, type: true, credentialId: true },
                          },
                          executions: {
                              where: { status: "FAILED" },
                              orderBy: { startedAt: "desc" },
                              take: 1,
                              select: {
                                  id: true,
                                  startedAt: true,
                                  error: true,
                                  nodes: {
                                      where: { status: "FAILED" },
                                      take: 1,
                                      select: { nodeName: true, nodeType: true, error: true },
                                  },
                              },
                          },
                      },
                  })
                : null;

            const lastFailed = workflow?.executions[0];

            return {
                ...message,
                workflow: workflow
                    ? {
                          id: workflow.id,
                          name: workflow.name,
                          active: workflow.active,
                          updatedAt: workflow.updatedAt,
                          nodes: workflow.nodes.map((node) => ({
                              id: node.id,
                              name: node.name,
                              type: node.type,
                              usesCredential: !!node.credentialId,
                          })),
                          lastFailedRun: lastFailed
                              ? {
                                    id: lastFailed.id,
                                    startedAt: lastFailed.startedAt,
                                    error: lastFailed.error?.slice(0, 2000) ?? null,
                                    node: lastFailed.nodes[0]
                                        ? {
                                              name: lastFailed.nodes[0].nodeName,
                                              type: lastFailed.nodes[0].nodeType,
                                              error: lastFailed.nodes[0].error?.slice(0, 2000) ?? null,
                                          }
                                        : null,
                                }
                              : null,
                      }
                    : null,
            };
        }),

    // An answer: shown under the customer's My messages and emailed to the
    // address they gave. A new message moves to "in progress" unless the
    // admin resolves it with the reply.
    reply: adminActionProcedure
        .input(
            z.object({
                id: z.string().min(1).max(40),
                text: z.string().trim().min(1, "Write a reply").max(SUPPORT_REPLY_MAX),
                resolve: z.boolean().default(false),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const message = await prisma.supportMessage.findUnique({
                where: { id: input.id },
                select: { id: true, userId: true, title: true, name: true, email: true, status: true },
            });
            if (!message) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });

            const status = input.resolve ? "resolved" : message.status === "new" ? "in_progress" : message.status;
            await prisma.$transaction([
                prisma.supportReply.create({
                    data: { messageId: message.id, adminId: ctx.auth.user.id, text: input.text },
                }),
                prisma.supportMessage.update({ where: { id: message.id }, data: { status } }),
            ]);

            let emailed = false;
            if (process.env.RESEND_API_KEY) {
                const email = buildSupportReplyEmail({
                    appUrl: getAppUrl(),
                    title: message.title,
                    reply: input.text,
                    name: message.name,
                });
                try {
                    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
                        from: process.env.EMAIL_FROM || "RXJ <onboarding@resend.dev>",
                        to: message.email,
                        subject: email.subject,
                        text: email.text,
                        html: email.html,
                    });
                    emailed = !error;
                    if (error) console.error("Support reply email was not sent:", error.message);
                } catch (error) {
                    console.error("Support reply email error:", error instanceof Error ? error.message : error);
                }
            }

            await recordAudit({
                userId: ctx.auth.user.id,
                action: "support.replied",
                target: `Support message "${message.title.slice(0, 80)}" (${message.id})`,
            });

            return { status, emailed };
        }),

    setSupportStatus: adminActionProcedure
        .input(z.object({ id: z.string().min(1).max(40), status: statusSchema }))
        .mutation(async ({ ctx, input }) => {
            const message = await prisma.supportMessage.findUnique({
                where: { id: input.id },
                select: { id: true, title: true, status: true },
            });
            if (!message) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
            if (message.status === input.status) return { status: input.status };

            await prisma.supportMessage.update({ where: { id: message.id }, data: { status: input.status } });
            await recordAudit({
                userId: ctx.auth.user.id,
                action: "support.status_changed",
                target: `Support message "${message.title.slice(0, 80)}" (${message.id}): ${message.status} → ${input.status}`,
            });

            return { status: input.status };
        }),
});
