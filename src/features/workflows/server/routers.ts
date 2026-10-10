import { PAGINATION } from "@/config/constants";
import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { generateSlug } from "random-word-slugs"
import z from "zod";
import type { Node, Edge } from "@xyflow/react"
import { NodeType } from "@prisma/client"
import { sendWorkflowExecution } from "@/inngest/utils";
import { TRPCError } from "@trpc/server";
import { PLAN_LIMITS, getRequiredPlanForNode } from "@/config/plans";
import { TRIGGER_SOURCES } from "@/config/trigger-sources";
import { TESTABLE_TRIGGERS, TRIGGER_LABELS, buildTestPayload } from "./test-payloads";
import { syncTelegramWebhooks } from "@/lib/telegram";
import { assertOwnership } from "@/lib/ownership";
import { describeAuditTarget } from "@/lib/audit-actions";
import { recordAudit } from "@/lib/audit-log";

// Every procedure that takes a workflow id starts here: a workflow that does
// not exist and one that belongs to someone else are the same "not found"
const getOwnedWorkflow = async (id: string, userId: string) =>
    assertOwnership(
        await prisma.workflow.findUnique({ where: { id } }),
        userId,
        "Workflow"
    );

export const workflowsRouter = createTRPCRouter({

    //EXECUTE WORKFLOW
    execute: protectedProcedure
        .input(z.object({
            id: z.string(),
            // Sent by the editor's chat panel: runs the Chat Trigger branch
            chat: z.object({
                message: z.string().min(1),
                sessionId: z.string().min(1),
            }).optional(),
            // Which trigger the editor's Execute button runs. Anything other
            // than the manual trigger is a test run with a sample payload.
            trigger: z.enum(TESTABLE_TRIGGERS).default(NodeType.MANUAL_TRIGGER),
        }))
        .mutation(async ({ input, ctx }) => {
            const user = await prisma.user.findUniqueOrThrow({
                where: {
                    id: ctx.auth.user.id,
                },
            });
            const workflow = await getOwnedWorkflow(input.id, ctx.auth.user.id);

            // Runs use the saved workflow, so the trigger has to be saved too
            const triggerType = input.chat ? NodeType.CHAT_TRIGGER : input.trigger;

            const triggerNode = await prisma.node.findFirst({
                where: {
                    workflowId: workflow.id,
                    type: triggerType,
                },
            });

            if (!triggerNode) {
                throw new TRPCError({
                    code: "BAD_REQUEST",

                    message: "The saved workflow does not have this trigger yet. Save the workflow and try again.",
                });
            }

            // Plan locks apply to test runs too
            const requiredPlan = getRequiredPlanForNode(
                triggerType,
                user.plan,
                user.trialEndsAt
            );

            if (requiredPlan) {
                throw new TRPCError({
                    code: "FORBIDDEN",

                    message: `This trigger requires the ${requiredPlan} plan.`,
                });
            }

            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);

            const executionsThisMonth = await prisma.execution.count({
                where: {
                    workflow: {
                        userId: ctx.auth.user.id,
                    },
                    startedAt: {
                        gte: startOfMonth,
                    },
                },
            });


            const executionLimit =
                PLAN_LIMITS[user.plan]
                    .monthlyExecutions;

            if (executionsThisMonth >= executionLimit) {
                throw new TRPCError({
                    code: "FORBIDDEN",

                    message: `Monthly execution limit reached. Your current plan includes ${executionLimit} executions per month.`,
                });
            }

            const execution =
                await prisma.execution.create({
                    data: {
                        workflowId:
                            workflow.id,

                        status: "RUNNING",

                        triggerSource: input.chat
                            ? TRIGGER_SOURCES.CHAT
                            : input.trigger === NodeType.MANUAL_TRIGGER
                                ? TRIGGER_SOURCES.MANUAL
                                : TRIGGER_SOURCES.MANUAL_TEST,
                    },
                });

            await sendWorkflowExecution({
                workflowId: input.id,
                executionId:
                    execution.id,

                ...(input.chat
                    ? {
                        trigger: NodeType.CHAT_TRIGGER,
                        InitialData: {
                            action: "sendMessage",
                            chatInput: input.chat.message,
                            sessionId: input.chat.sessionId,
                        },
                    }
                    : {
                        // The engine starts from this trigger only. The real
                        // webhook routes are not involved, so their secret and
                        // Active checks stay as they are.
                        trigger: input.trigger,
                        InitialData: buildTestPayload(
                            input.trigger,
                            (triggerNode.data ?? {}) as Record<string, unknown>
                        ),
                    }),
            });

            await prisma.user.update({
                where: {
                    id: ctx.auth.user.id,
                },

                data: {
                    executionsUsed: {
                        increment: 1,
                    },
                },
            });

            return {
                ...workflow,

                executionId:
                    execution.id,
            };
        }),


    // CREATE WORKFLOW
    create: protectedProcedure.mutation(async ({ ctx }) => {
        const user = await prisma.user.findUniqueOrThrow({
            where: {
                id: ctx.auth.user.id,
            },
        });

        const workflowCount =
            await prisma.workflow.count({
                where: {
                    userId: ctx.auth.user.id,
                },
            });

        const workflowLimit =
            PLAN_LIMITS[user.plan]
                .activeWorkflows;

        const hasReachedLimit =
            workflowCount >= workflowLimit;

        if (hasReachedLimit) {
            throw new TRPCError({
                code: "FORBIDDEN",

                message: `Workflow limit reached. Your current plan allows up to ${workflowLimit} workflows.`,
            });
        }

        const workflow =
            await prisma.workflow.create({
                data: {
                    name: generateSlug(3),

                    userId: ctx.auth.user.id,

                    nodes: {
                        create: {
                            type: NodeType.INITIAL,

                            position: {
                                x: 0,
                                y: 0,
                            },

                            name: NodeType.INITIAL,
                        },
                    },
                },
            });

        await prisma.user.update({
            where: {
                id: ctx.auth.user.id,
            },

            data: {
                workflowCount: {
                    increment: 1,
                },
            },
        });

        return workflow;
    }),

    // DELETE WORKFLOW
    remove: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await getOwnedWorkflow(input.id, ctx.auth.user.id);

            const deleted = await prisma.workflow.delete({
                where: {
                    id: input.id,
                    userId: ctx.auth.user.id
                }
            })

            await recordAudit({
                userId: ctx.auth.user.id,
                action: "workflow.deleted",
                target: describeAuditTarget("Workflow", deleted),
            });

            return deleted;
        }),

    // UPDATE WORKFLOW NAME
    updateName: protectedProcedure
        .input(z.object({ id: z.string(), name: z.string().min(1) }))
        .mutation(async ({ ctx, input }) => {
            await getOwnedWorkflow(input.id, ctx.auth.user.id);

            return prisma.workflow.update({
                where: {
                    id: input.id,
                    userId: ctx.auth.user.id
                },
                data: { name: input.name },
            })
        }),

    // "Don't save node input/output": only status and errors are kept
    setSaveExecutionData: protectedProcedure
        .input(z.object({ id: z.string(), save: z.boolean() }))
        .mutation(async ({ ctx, input }) => {
            await getOwnedWorkflow(input.id, ctx.auth.user.id);

            return prisma.workflow.update({
                where: {
                    id: input.id,
                    userId: ctx.auth.user.id
                },
                data: { saveExecutionData: input.save },
                select: { id: true, name: true, saveExecutionData: true },
            })
        }),

    // ACTIVATE / DEACTIVATE WORKFLOW
    // Only active workflows run from schedules and webhooks. Manual runs and
    // the chat panel always work, so a workflow can be tested while inactive.
    setActive: protectedProcedure
        .input(z.object({ id: z.string(), active: z.boolean() }))
        .mutation(async ({ ctx, input }) => {
            await getOwnedWorkflow(input.id, ctx.auth.user.id);

            // Telegram Trigger: the bot's webhook is registered on activation
            // and removed on deactivation, like n8n does
            const telegramError = await syncTelegramWebhooks({
                workflowId: input.id,
                userId: ctx.auth.user.id,
                active: input.active,
            })

            if (telegramError) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: telegramError,
                });
            }

            const workflow = await prisma.workflow.update({
                where: {
                    id: input.id,
                    userId: ctx.auth.user.id
                },
                data: { active: input.active },
            })

            await recordAudit({
                userId: ctx.auth.user.id,
                action: input.active ? "workflow.activated" : "workflow.deactivated",
                target: describeAuditTarget("Workflow", workflow),
            });

            return workflow;
        }),

    // UPDATE WORKFLOW
    update: protectedProcedure
        .input(z.object({
            id: z.string(),
            nodes: z.array(
                z.object({
                    id: z.string(),
                    type: z.string().nullish(),
                    position: z.object({
                        x: z.number(), y: z.number(),
                    }),
                    data: z.record(z.string(), z.any()).optional(),
                    credentialId: z.string().nullish(),
                }),
            ),
            edges: z.array(
                z.object({
                    source: z.string(),
                    target: z.string(),
                    sourceHandle: z.string().nullish(),
                    targetHandle: z.string().nullish(),
                }),
            )
        })
        )
        .mutation(async ({ ctx, input }) => {
            const { id, nodes, edges } = input;

            const workflow = await getOwnedWorkflow(input.id, ctx.auth.user.id);

            // A node is only linked to a credential of the same user. An id
            // that is someone else's, or of a credential that was deleted,
            // is not linked. (When a node runs, its executor looks the
            // credential up by id and owner anyway.)
            const linkedIds = nodes.flatMap((node) => node.credentialId ?? []);
            const ownCredentialIds = new Set(
                linkedIds.length === 0
                    ? []
                    : (
                        await prisma.credential.findMany({
                            where: { id: { in: linkedIds }, userId: ctx.auth.user.id },
                            select: { id: true },
                        })
                    ).map((credential) => credential.id)
            );

            // A connection may only join two nodes of this workflow
            const nodeIds = new Set(nodes.map((node) => node.id));
            if (edges.some((edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target))) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "A connection points at a node that is not in this workflow.",
                });
            }

            // Node ids come from the editor. One that is already used in
            // another workflow would attach this save to that workflow's node.
            const taken = await prisma.node.findFirst({
                where: { id: { in: [...nodeIds] }, workflowId: { not: id } },
                select: { id: true },
            });
            if (taken) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "A node id is already used by another workflow. Reload the editor and try again.",
                });
            }

            // Transaction to ensure consistency
            const saved = await prisma.$transaction(async (tx) => {
                // Delete existing nodes and connections (cascade deletes connections)
                await tx.node.deleteMany({
                    where: { workflowId: id }
                });

                // Create nodes
                await tx.node.createMany({
                    data: nodes.map((node) => ({
                        id: node.id,
                        workflowId: id,
                        name: node.type || "unknown",
                        type: node.type as NodeType,
                        position: node.position,
                        data: node.data || {},
                        credentialId:
                            node.credentialId && ownCredentialIds.has(node.credentialId)
                                ? node.credentialId
                                : null,
                    }))
                })

                // Create Connections
                await tx.connection.createMany({
                    data: edges.map((edge) => ({
                        workflowId: id,
                        fromNodeId: edge.source,
                        toNodeId: edge.target,
                        fromOutput: edge.sourceHandle || "main",
                        toInput: edge.targetHandle || "main",
                    })),
                })

                // Update workflow's updateAt timestamp
                await tx.workflow.update({
                    where: { id },
                    data: { updatedAt: new Date() },
                })
                return workflow;
            })

            // A Telegram Trigger added or changed while the workflow is
            // active needs its webhook registered right away
            if (workflow.active) {
                const telegramError = await syncTelegramWebhooks({
                    workflowId: id,
                    userId: ctx.auth.user.id,
                    active: true,
                })

                if (telegramError) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: `The workflow was saved. ${telegramError}`,
                    });
                }
            }

            return saved;
        }),

    // UPDATE ONE
    getOne: protectedProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ ctx, input }) => {
            const workflow = assertOwnership(
                await prisma.workflow.findUnique({
                    where: { id: input.id },
                    include: { nodes: true, connections: true },
                }),
                ctx.auth.user.id,
                "Workflow"
            )
            // Transform server nodes to react-flow compatible nodes
            const nodes: Node[] = workflow.nodes.map((node) => ({
                id: node.id,
                type: node.type,
                position: node.position as { x: number; y: number },
                data: (node.data as Record<string, unknown>) || {},
                credentialId: node.credentialId,
            }))

            // Transform server connections to react-flow compatible edges
            const edges: Edge[] = workflow.connections.map((connection) => ({
                id: connection.id,
                source: connection.fromNodeId,
                target: connection.toNodeId,
                sourceHandle: connection.fromOutput,
                targetHandle: connection.toInput,
            }))

            return {
                id: workflow.id,
                name: workflow.name,
                active: workflow.active,
                saveExecutionData: workflow.saveExecutionData,
                nodes,
                edges
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
                search: z.string().default(""),
            })
        )
        .query(async ({ ctx, input }) => {
            const { page, pageSize, search } = input
            const [items, totalCount] = await Promise.all([
                prisma.workflow.findMany({
                    skip: (page - 1) * pageSize,
                    take: pageSize,
                    where: {
                        userId: ctx.auth.user.id,
                        name: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                    orderBy: {
                        updatedAt: "desc"
                    }
                }),
                prisma.workflow.count({
                    where: {
                        userId: ctx.auth.user.id,
                        name: {
                            contains: search,
                            mode: "insensitive",
                        },
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