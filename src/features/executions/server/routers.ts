import { PAGINATION } from "@/config/constants";
import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import z from "zod";
import { TRPCError } from "@trpc/server";
import { RetryError, retryExecution } from "./retry";
import { assertOwnership } from "@/lib/ownership";
import {
    RETENTION_DAY_OPTIONS,
    normalizeRetentionDays,
} from "@/lib/execution-retention";

export const executionsRouter = createTRPCRouter({

    // "Execution data retention": how long the user's execution data is kept
    getRetention: protectedProcedure.query(async ({ ctx }) => {
        const user = await prisma.user.findUniqueOrThrow({
            where: { id: ctx.auth.user.id },
            select: { executionRetentionDays: true },
        });

        return { days: normalizeRetentionDays(user.executionRetentionDays) };
    }),

    setRetention: protectedProcedure
        .input(
            z.object({
                days: z
                    .number()
                    .refine(
                        (days) => (RETENTION_DAY_OPTIONS as readonly number[]).includes(days),
                        `Pick one of ${RETENTION_DAY_OPTIONS.join(", ")} days`
                    ),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const user = await prisma.user.update({
                where: { id: ctx.auth.user.id },
                data: { executionRetentionDays: input.days },
                select: { executionRetentionDays: true },
            });

            return { days: normalizeRetentionDays(user.executionRetentionDays) };
        }),

    // RUN AGAIN: same trigger, same starting data, current workflow
    retry: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            try {
                return await retryExecution(input.id, ctx.auth.user.id);
            } catch (error) {
                if (error instanceof RetryError) {
                    throw new TRPCError({
                        code:
                            error.reason === "not_found"
                                ? "NOT_FOUND"
                                : error.reason === "limit"
                                    ? "FORBIDDEN"
                                    : "BAD_REQUEST",
                        message: error.message,
                    });
                }

                throw error;
            }
        }),

    // UPDATE ONE
    getOne: protectedProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ ctx, input }) => {
            const { workflow, ...execution } = assertOwnership(
                await prisma.execution.findUnique({
                    where: { id: input.id },
                    include: {
                        workflow: {
                            select: {
                                id: true,
                                name: true,
                                userId: true,
                            }
                        }
                    }
                }),
                ctx.auth.user.id,
                "Execution",
                (found) => found.workflow.userId
            )

            return {
                ...execution,
                workflow: { id: workflow.id, name: workflow.name },
            }
        }),

    // Data of the workflow's most recent run, for the editor's variable picker
    getLatestData: protectedProcedure
        .input(z.object({ workflowId: z.string() }))
        .query(async ({ ctx, input }) => {
            assertOwnership(
                await prisma.workflow.findUnique({
                    where: { id: input.workflowId },
                    select: { userId: true },
                }),
                ctx.auth.user.id,
                "Workflow"
            )

            const execution = await prisma.execution.findFirst({
                where: {
                    workflowId: input.workflowId,
                    workflow: {
                        userId: ctx.auth.user.id
                    }
                },
                orderBy: {
                    startedAt: "desc"
                },
                select: {
                    id: true,
                    status: true,
                    startedAt: true,
                    output: true,
                    nodes: {
                        orderBy: { startedAt: "desc" },
                        take: 1,
                        select: { input: true, output: true },
                    },
                },
            })

            if (!execution) return null

            // A failed or running execution has no final output yet: use what
            // its last node saw
            const lastNode = execution.nodes[0]

            return {
                executionId: execution.id,
                status: execution.status,
                startedAt: execution.startedAt,
                data: execution.output ?? lastNode?.output ?? lastNode?.input ?? {},
            }
        }),

    // UPDATE MANY
    getMany: protectedProcedure
        .input(
            z.object({
                page: z.number().default(PAGINATION.DEFAULT_PAGE),
                pageSize: z
                    .number()
                    .min(PAGINATION.MIN_PAGE_SIZE)
                    .max(PAGINATION.MAX_PAGE_SIZE)
                    .default(PAGINATION.DEFAULT_PAGE_SIZE),
            })
        )
        .query(async ({ ctx, input }) => {
            const { page, pageSize, } = input
            const [items, totalCount] = await Promise.all([
                prisma.execution.findMany({
                    skip: (page - 1) * pageSize,
                    take: pageSize,
                    where: {
                        workflow: { userId: ctx.auth.user.id },
                    },
                    orderBy: {
                        startedAt: "desc"
                    },
                    include: {
                        workflow: {
                            select: {
                                id: true,
                                name: true
                            }
                        }
                    }
                }),
                prisma.execution.count({
                    where: {
                        workflow: { userId: ctx.auth.user.id },
                    }
                })
            ])

            const totalPages = Math.ceil(totalCount / pageSize)
            const hasNextPage = page < totalPages
            const hasPreviousPage = page > 1;

            return {
                items,
                page,
                pageSize,
                totalCount,
                totalPages,
                hasNextPage,
                hasPreviousPage,
            }
        }),
});