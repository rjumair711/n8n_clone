import { PAGINATION } from "@/config/constants";
import prisma from "@/lib/db";
import { createTRPCRouter, editorProcedure, viewerProcedure, builderProcedure } from "@/trpc/init";
import { generateSlug } from "random-word-slugs"
import z from "zod";
import type { Node, Edge } from "@xyflow/react"
import { NodeType, type Prisma } from "@prisma/client"
import { sendWorkflowExecution } from "@/inngest/utils";
import { TRPCError } from "@trpc/server";
import { PLAN_LIMITS, getRequiredPlanForNode } from "@/config/plans";
import { TRIGGER_SOURCES } from "@/config/trigger-sources";
import { TESTABLE_TRIGGERS, TRIGGER_LABELS, buildTestPayload } from "./test-payloads";
import { syncTelegramWebhooks } from "@/lib/telegram";
import { assertOwnership } from "@/lib/ownership";
import { describeAuditTarget } from "@/lib/audit-actions";
import { recordAudit } from "@/lib/audit-log";
import { PARTIAL_RUN_MODES } from "@/inngest/engine";
import { readVersionSnapshot, readVersionSummary, toVersionSnapshot } from "../lib/versions";
import { hashSnapshot, saveWorkflowVersion } from "./versions";
import {
    PinError,
    pinNodeData,
    removeStalePins,
    unpinNodeData,
} from "@/features/executions/server/test-data";

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
    execute: editorProcedure
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
            // "Run this node only" ("node") or "Run from here" ("from"):
            // the nodes before it are not run, their saved or pinned data
            // is used. No trigger is started.
            partial: z.object({
                nodeId: z.string().min(1).max(100),
                mode: z.enum(PARTIAL_RUN_MODES as [string, ...string[]]),
            }).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            const user = await prisma.user.findUniqueOrThrow({
                where: {
                    id: ctx.workspace.ownerId,
                },
            });
            const workflow = await getOwnedWorkflow(input.id, ctx.workspace.ownerId);

            // Runs use the saved workflow, so the trigger has to be saved too
            const triggerType = input.chat ? NodeType.CHAT_TRIGGER : input.trigger;

            const triggerNode = input.partial
                ? null
                : await prisma.node.findFirst({
                    where: {
                        workflowId: workflow.id,
                        type: triggerType,
                    },
                });

            if (input.partial) {
                // The node of this workflow, as it was last saved
                const target = await prisma.node.findFirst({
                    where: { id: input.partial.nodeId, workflowId: workflow.id },
                    select: { id: true },
                });

                if (!target) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "That node is not in the saved workflow. Save the workflow and try again.",
                    });
                }
            } else if (!triggerNode) {
                throw new TRPCError({
                    code: "BAD_REQUEST",

                    message: "The saved workflow does not have this trigger yet. Save the workflow and try again.",
                });
            }

            // Plan locks apply to test runs too. In a partial run no trigger
            // runs; each node that does is checked when it runs.
            const requiredPlan = input.partial
                ? null
                : getRequiredPlanForNode(
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
                        userId: ctx.workspace.ownerId,
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

                        triggerSource: input.partial
                            ? TRIGGER_SOURCES.MANUAL_TEST
                            : input.chat
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

                // A run from the editor: pinned nodes are not run, their
                // pinned data is used. Webhooks, schedules and the public
                // chat never send this.
                usePinnedData: true,

                ...(input.partial
                    ? { partial: input.partial, InitialData: {} }
                    : input.chat
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
                            (triggerNode?.data ?? {}) as Record<string, unknown>
                        ),
                    }),
            });

            await prisma.user.update({
                where: {
                    id: ctx.workspace.ownerId,
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
    create: builderProcedure.mutation(async ({ ctx }) => {
        const user = await prisma.user.findUniqueOrThrow({
            where: {
                id: ctx.workspace.ownerId,
            },
        });

        const workflowCount =
            await prisma.workflow.count({
                where: {
                    userId: ctx.workspace.ownerId,
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

                    userId: ctx.workspace.ownerId,
                    workspaceId: ctx.workspace.id,

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
                id: ctx.workspace.ownerId,
            },

            data: {
                workflowCount: {
                    increment: 1,
                },
            },
        });

        return workflow;
    }),

    // PINNED DATA
    // The nodes of a workflow that have pinned data, for the editor
    getPinnedNodes: viewerProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ ctx, input }) => {
            await getOwnedWorkflow(input.id, ctx.workspace.ownerId);

            // Which nodes and since when; the data itself stays on the server
            return prisma.pinnedData.findMany({
                where: { workflowId: input.id },
                select: { nodeId: true, executionId: true, createdAt: true },
            });
        }),

    // Pins a node's output: from the given execution, or from the newest
    // run that has it. In runs from the editor the node is then not run.
    pinNode: editorProcedure
        .input(z.object({
            id: z.string(),
            nodeId: z.string().min(1).max(100),
            executionId: z.string().min(1).max(100).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            await getOwnedWorkflow(input.id, ctx.workspace.ownerId);

            try {
                return await pinNodeData({
                    workflowId: input.id,
                    nodeId: input.nodeId,
                    executionId: input.executionId,
                });
            } catch (error) {
                if (error instanceof PinError) {
                    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
                }

                throw error;
            }
        }),

    unpinNode: editorProcedure
        .input(z.object({ id: z.string(), nodeId: z.string().min(1).max(100) }))
        .mutation(async ({ ctx, input }) => {
            await getOwnedWorkflow(input.id, ctx.workspace.ownerId);

            return { removed: await unpinNodeData(input.id, input.nodeId) };
        }),

    // DELETE WORKFLOW
    remove: builderProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await getOwnedWorkflow(input.id, ctx.workspace.ownerId);

            const deleted = await prisma.workflow.delete({
                where: {
                    id: input.id,
                    userId: ctx.workspace.ownerId
                }
            })

            await recordAudit({
                userId: ctx.workspace.ownerId,
                actor: ctx.workspace.actor,
                action: "workflow.deleted",
                target: describeAuditTarget("Workflow", deleted),
            });

            return deleted;
        }),

    // UPDATE WORKFLOW NAME
    updateName: builderProcedure
        .input(z.object({ id: z.string(), name: z.string().min(1) }))
        .mutation(async ({ ctx, input }) => {
            await getOwnedWorkflow(input.id, ctx.workspace.ownerId);

            return prisma.workflow.update({
                where: {
                    id: input.id,
                    userId: ctx.workspace.ownerId
                },
                data: { name: input.name },
            })
        }),

    // "Don't save node input/output": only status and errors are kept
    setSaveExecutionData: editorProcedure
        .input(z.object({ id: z.string(), save: z.boolean() }))
        .mutation(async ({ ctx, input }) => {
            await getOwnedWorkflow(input.id, ctx.workspace.ownerId);

            return prisma.workflow.update({
                where: {
                    id: input.id,
                    userId: ctx.workspace.ownerId
                },
                data: { saveExecutionData: input.save },
                select: { id: true, name: true, saveExecutionData: true },
            })
        }),

    // ACTIVATE / DEACTIVATE WORKFLOW
    // Only active workflows run from schedules and webhooks. Manual runs and
    // the chat panel always work, so a workflow can be tested while inactive.
    setActive: editorProcedure
        .input(z.object({ id: z.string(), active: z.boolean() }))
        .mutation(async ({ ctx, input }) => {
            await getOwnedWorkflow(input.id, ctx.workspace.ownerId);

            // Telegram Trigger: the bot's webhook is registered on activation
            // and removed on deactivation, like n8n does
            const telegramError = await syncTelegramWebhooks({
                workflowId: input.id,
                userId: ctx.workspace.ownerId,
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
                    userId: ctx.workspace.ownerId
                },
                data: { active: input.active },
            })

            await recordAudit({
                userId: ctx.workspace.ownerId,
                actor: ctx.workspace.actor,
                action: input.active ? "workflow.activated" : "workflow.deactivated",
                target: describeAuditTarget("Workflow", workflow),
            });

            return workflow;
        }),

    // UPDATE WORKFLOW
    update: builderProcedure
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

            const workflow = await getOwnedWorkflow(input.id, ctx.workspace.ownerId);

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
                            where: { id: { in: linkedIds }, userId: ctx.workspace.ownerId },
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

            // A node that was removed takes its pinned data with it
            await removeStalePins(id, [...nodeIds]);

            // Version history: what was just saved, unless it is what the
            // newest version already holds. The save itself has succeeded:
            // a version that could not be written does not undo it.
            try {
                await saveWorkflowVersion({
                    workflowId: id,
                    nodes: nodes.map((node) => ({
                        id: node.id,
                        type: node.type || "unknown",
                        position: node.position,
                        data: node.data || {},
                        credentialId:
                            node.credentialId && ownCredentialIds.has(node.credentialId)
                                ? node.credentialId
                                : null,
                    })),
                    connections: edges.map((edge) => ({
                        fromNodeId: edge.source,
                        toNodeId: edge.target,
                        fromOutput: edge.sourceHandle || "main",
                        toInput: edge.targetHandle || "main",
                    })),
                });
            } catch (error) {
                console.error(
                    "[RXJ] Could not save a workflow version:",
                    error instanceof Error ? error.name : "error"
                );
            }

            // A Telegram Trigger added or changed while the workflow is
            // active needs its webhook registered right away
            if (workflow.active) {
                const telegramError = await syncTelegramWebhooks({
                    workflowId: id,
                    userId: ctx.workspace.ownerId,
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

    // VERSION HISTORY
    // The versions of a workflow, newest first: when, and what changed.
    // The nodes themselves are only read when a version is restored.
    getVersions: viewerProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ ctx, input }) => {
            await getOwnedWorkflow(input.id, ctx.workspace.ownerId);

            const versions = await prisma.workflowVersion.findMany({
                where: { workflowId: input.id },
                orderBy: { number: "desc" },
                take: 200,
                select: {
                    id: true,
                    number: true,
                    createdAt: true,
                    summary: true,
                    restoredFromNumber: true,
                },
            });

            return versions.map((version, index) => ({
                id: version.id,
                number: version.number,
                createdAt: version.createdAt,
                restoredFromNumber: version.restoredFromNumber,
                summary: readVersionSummary(version.summary),
                // The newest is what the workflow is now
                current: index === 0,
            }));
        }),

    // Puts the workflow back to one of its versions. That makes a new
    // version, so restoring can itself be undone.
    restoreVersion: builderProcedure
        .input(z.object({ id: z.string(), versionId: z.string().min(1).max(100) }))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.workspace.ownerId;
            const workflow = await getOwnedWorkflow(input.id, userId);

            // A version of this workflow: another workflow's id finds nothing
            const version = await prisma.workflowVersion.findFirst({
                where: { id: input.versionId, workflowId: workflow.id },
            });

            if (!version) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Version not found." });
            }

            const snapshot = readVersionSnapshot(version.nodes, version.connections);

            // What the workflow holds right now. It is not always the newest
            // version: a workflow can be changed without the editor's Save
            // (a chatbot given its WhatsApp side, for example).
            const [currentNodes, currentConnections] = await Promise.all([
                prisma.node.findMany({ where: { workflowId: workflow.id } }),
                prisma.connection.findMany({ where: { workflowId: workflow.id } }),
            ]);

            if (
                hashSnapshot(toVersionSnapshot(currentNodes, currentConnections)) ===
                hashSnapshot(snapshot)
            ) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "The workflow is already the same as this version.",
                });
            }

            // Kept as a version before it is replaced, so the restore can
            // always be undone. Nothing is added when it already is the
            // newest version. Not caught: without it there is no way back.
            await saveWorkflowVersion({
                workflowId: workflow.id,
                nodes: currentNodes,
                connections: currentConnections,
            });

            // The same rules as a save: only the user's own credentials
            // that still exist are linked, only node types that still
            // exist come back, and no node id of another workflow is used
            const nodeTypes = new Set<string>(Object.values(NodeType));
            const nodes = snapshot.nodes.filter((node) => nodeTypes.has(node.type));
            const nodeIds = new Set(nodes.map((node) => node.id));
            const connections = snapshot.connections.filter(
                (connection) =>
                    nodeIds.has(connection.fromNodeId) && nodeIds.has(connection.toNodeId)
            );

            const linkedIds = nodes.flatMap((node) => node.credentialId ?? []);
            const ownCredentialIds = new Set(
                linkedIds.length === 0
                    ? []
                    : (
                        await prisma.credential.findMany({
                            where: { id: { in: linkedIds }, userId },
                            select: { id: true },
                        })
                    ).map((credential) => credential.id)
            );

            const taken = await prisma.node.findFirst({
                where: { id: { in: [...nodeIds] }, workflowId: { not: workflow.id } },
                select: { id: true },
            });

            if (taken) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "This version cannot be restored: one of its node ids is now used by another workflow.",
                });
            }

            const restored = nodes.map((node) => ({
                ...node,
                credentialId:
                    node.credentialId && ownCredentialIds.has(node.credentialId)
                        ? node.credentialId
                        : null,
            }));

            await prisma.$transaction(async (tx) => {
                await tx.node.deleteMany({ where: { workflowId: workflow.id } });

                await tx.node.createMany({
                    data: restored.map((node) => ({
                        id: node.id,
                        workflowId: workflow.id,
                        name: node.type,
                        type: node.type as NodeType,
                        position: node.position,
                        data: node.data as Prisma.InputJsonValue,
                        credentialId: node.credentialId,
                    })),
                });

                await tx.connection.createMany({
                    data: connections.map((connection) => ({
                        workflowId: workflow.id,
                        ...connection,
                    })),
                });

                await tx.workflow.update({
                    where: { id: workflow.id },
                    data: { updatedAt: new Date() },
                });
            });

            await removeStalePins(workflow.id, [...nodeIds]);

            const created = await saveWorkflowVersion({
                workflowId: workflow.id,
                nodes: restored,
                connections,
                restoredFromNumber: version.number,
            });

            await recordAudit({
                userId,
                action: "workflow.version_restored",
                target: `${describeAuditTarget("Workflow", workflow)}, version ${version.number}`,
            });

            // A Telegram Trigger that came back needs its webhook
            if (workflow.active) {
                const telegramError = await syncTelegramWebhooks({
                    workflowId: workflow.id,
                    userId,
                    active: true,
                });

                if (telegramError) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: `The version was restored. ${telegramError}`,
                    });
                }
            }

            return { restoredNumber: version.number, number: created.number };
        }),

    // UPDATE ONE
    getOne: viewerProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ ctx, input }) => {
            const workflow = assertOwnership(
                await prisma.workflow.findUnique({
                    where: { id: input.id },
                    include: { nodes: true, connections: true },
                }),
                ctx.workspace.ownerId,
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
    getMany: viewerProcedure
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
                        userId: ctx.workspace.ownerId,
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
                        userId: ctx.workspace.ownerId,
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