import { PAGINATION } from "@/config/constants";
import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import z from "zod";

export const executionsRouter = createTRPCRouter({

    // UPDATE ONE
    getOne: protectedProcedure
        .input(z.object({ id: z.string() }))
        .query(({ ctx, input }) => {
            return prisma.execution.findUniqueOrThrow({
                where: {
                    id: input.id,
                    workflow: {
                        userId: ctx.auth.user.id
                    }
                },
                include: {
                    workflow: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                }
            })
        }),

    // Data of the workflow's most recent run, for the editor's variable picker
    getLatestData: protectedProcedure
        .input(z.object({ workflowId: z.string() }))
        .query(async ({ ctx, input }) => {
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