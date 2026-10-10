import { createId } from "@paralleldrive/cuid2";
import { NodeType, type Prisma, SubscriptionPlan } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import z from "zod";
import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { PLAN_LIMITS } from "@/config/plans";
import {
    ADMIN_TWO_FACTOR_MESSAGE,
    canUseAdminActions,
    isAdmin as isAdminUser,
} from "@/lib/admin";
import { assertOwnership } from "@/lib/ownership";
import {
    PLAN_NAMES,
    canUseTemplate,
    instantiateTemplate,
    toTemplateData,
    type TemplateConnection,
    type TemplateNode,
} from "../lib/template-data";
import { scanTemplateForSecrets } from "../lib/template-secrets";
import { describeAuditTarget } from "@/lib/audit-actions";
import { recordAudit } from "@/lib/audit-log";

// Publishing, editing and deleting templates is for admins: a verified
// account whose email is in ADMIN_EMAILS
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
    if (!isAdminUser(ctx.auth.user)) {
        throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only an admin can manage templates.",
        });
    }

    // An admin account is worth stealing: it has to have two-factor on
    if (!canUseAdminActions(ctx.auth.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: ADMIN_TWO_FACTOR_MESSAGE });
    }

    return next();
});

const templateFields = {
    name: z.string().trim().min(1, "Name is required").max(80),
    description: z.string().trim().min(1, "Description is required").max(600),
    category: z.string().trim().min(1, "Category is required").max(40),
    minPlan: z.enum(SubscriptionPlan),
    published: z.boolean(),
    // "I checked this, publish anyway": saves although the scan found
    // something that looks like a secret
    confirmSecrets: z.boolean().optional(),
};

const NODE_TYPES = new Set<string>(Object.values(NodeType));

// Also says when the admin saved it although the secret scan objected
const templateAuditTarget = (
    template: { id: string; name: string },
    { hidden, secretsConfirmed }: { hidden: boolean; secretsConfirmed: boolean }
) =>
    describeAuditTarget("Template", template) +
    (hidden ? ", hidden" : "") +
    (secretsConfirmed ? ", saved despite the secret scan" : "");

export const templatesRouter = createTRPCRouter({
    // The gallery. Everyone sees every published template; `locked` says
    // whether the user's plan can use it. Admins also see unpublished ones.
    getMany: protectedProcedure.query(async ({ ctx }) => {
        const isAdmin = isAdminUser(ctx.auth.user);

        const user = await prisma.user.findUniqueOrThrow({
            where: { id: ctx.auth.user.id },
            select: { plan: true, trialEndsAt: true },
        });

        const templates = await prisma.workflowTemplate.findMany({
            where: isAdmin ? {} : { published: true },
            orderBy: [{ category: "asc" }, { createdAt: "desc" }],
            // The workflow itself is only loaded when a template is used
            select: {
                id: true,
                name: true,
                description: true,
                category: true,
                minPlan: true,
                published: true,
                nodeTypes: true,
                useCount: true,
                updatedAt: true,
            },
        });

        return {
            isAdmin,
            // An admin who has not turned two-factor on yet: the admin
            // buttons are replaced by a note saying so
            needsTwoFactor: isAdmin && !canUseAdminActions(ctx.auth.user),
            items: templates.map((template) => ({
                ...template,
                locked: !canUseTemplate(template.minPlan, user.plan, user.trialEndsAt),
            })),
        };
    }),

    // Copies a template into the user's account as a new workflow
    use: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const isAdmin = isAdminUser(ctx.auth.user);

            const template = await prisma.workflowTemplate.findFirst({
                where: { id: input.id, ...(isAdmin ? {} : { published: true }) },
            });

            if (!template) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Template not found." });
            }

            const user = await prisma.user.findUniqueOrThrow({
                where: { id: ctx.auth.user.id },
            });

            // Checked here, not only in the gallery: the lock is a rule
            if (!canUseTemplate(template.minPlan, user.plan, user.trialEndsAt)) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: `This template requires the ${PLAN_NAMES[template.minPlan]} plan.`,
                });
            }

            const workflowCount = await prisma.workflow.count({
                where: { userId: user.id },
            });

            const workflowLimit = PLAN_LIMITS[user.plan].activeWorkflows;

            if (workflowCount >= workflowLimit) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: `Workflow limit reached. Your current plan allows up to ${workflowLimit} workflows.`,
                });
            }

            const copy = instantiateTemplate(
                template.nodes as unknown as TemplateNode[],
                template.connections as unknown as TemplateConnection[],
                createId
            );

            // A node type that no longer exists would make the workflow
            // impossible to open
            const nodes = copy.nodes.filter((node) => NODE_TYPES.has(node.type));
            const nodeIds = new Set(nodes.map((node) => node.id));

            const workflow = await prisma.$transaction(async (tx) => {
                const created = await tx.workflow.create({
                    data: { name: template.name, userId: user.id },
                });

                if (nodes.length === 0) {
                    await tx.node.create({
                        data: {
                            workflowId: created.id,
                            type: NodeType.INITIAL,
                            name: NodeType.INITIAL,
                            position: { x: 0, y: 0 },
                        },
                    });
                } else {
                    await tx.node.createMany({
                        data: nodes.map((node) => ({
                            id: node.id,
                            workflowId: created.id,
                            name: node.type,
                            type: node.type as NodeType,
                            position: node.position as Prisma.InputJsonValue,
                            data: node.data as Prisma.InputJsonValue,
                        })),
                    });

                    await tx.connection.createMany({
                        data: copy.connections
                            .filter(
                                (conn) =>
                                    nodeIds.has(conn.fromNodeId) && nodeIds.has(conn.toNodeId)
                            )
                            .map((conn) => ({ ...conn, workflowId: created.id })),
                    });
                }

                await tx.user.update({
                    where: { id: user.id },
                    data: { workflowCount: { increment: 1 } },
                });

                await tx.workflowTemplate.update({
                    where: { id: template.id },
                    data: { useCount: { increment: 1 } },
                });

                return created;
            });

            return { id: workflow.id, name: workflow.name };
        }),

    // ADMIN: the admin's own workflows, to pick one to publish
    getSourceWorkflows: adminProcedure.query(({ ctx }) =>
        prisma.workflow.findMany({
            where: { userId: ctx.auth.user.id },
            orderBy: { updatedAt: "desc" },
            select: { id: true, name: true },
        })
    ),

    // ADMIN: publish one of the admin's workflows as a template
    create: adminProcedure
        .input(z.object({ workflowId: z.string(), ...templateFields }))
        .mutation(async ({ ctx, input }) => {
            const { workflowId, confirmSecrets, ...fields } = input;

            const workflow = assertOwnership(
                await prisma.workflow.findUnique({
                    where: { id: workflowId },
                    include: { nodes: true, connections: true },
                }),
                ctx.auth.user.id,
                "Workflow"
            );

            const data = toTemplateData(workflow.nodes, workflow.connections);

            if (data.nodes.length === 0) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "That workflow is empty. Add nodes and save it first.",
                });
            }

            const findings = scanTemplateForSecrets(data.nodes);

            if (findings.length > 0 && !confirmSecrets) {
                return { saved: false as const, findings };
            }

            const template = await prisma.workflowTemplate.create({
                data: {
                    ...fields,
                    nodes: data.nodes as unknown as Prisma.InputJsonValue,
                    connections: data.connections as unknown as Prisma.InputJsonValue,
                    nodeTypes: data.nodeTypes,
                    createdById: ctx.auth.user.id,
                },
                select: { id: true, name: true },
            });

            await recordAudit({
                userId: ctx.auth.user.id,
                action: "template.published",
                target: templateAuditTarget(template, {
                    hidden: !fields.published,
                    secretsConfirmed: findings.length > 0,
                }),
            });

            return { saved: true as const, ...template };
        }),

    // ADMIN: change a template's details, or replace its content with the
    // current version of one of the admin's workflows
    update: adminProcedure
        .input(
            z.object({
                id: z.string(),
                workflowId: z.string().optional(),
                ...templateFields,
            })
        )
        .mutation(async ({ ctx, input }) => {
            const { id, workflowId, confirmSecrets, ...fields } = input;

            const existing = await prisma.workflowTemplate.findUnique({
                where: { id },
                select: { nodes: true },
            });

            if (!existing) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Template not found." });
            }

            let content = {};
            // Without a workflow the content stays, and is scanned again: it
            // may have been saved before the scan existed
            let nodes = existing.nodes as unknown as TemplateNode[];

            if (workflowId) {
                const workflow = assertOwnership(
                    await prisma.workflow.findUnique({
                        where: { id: workflowId },
                        include: { nodes: true, connections: true },
                    }),
                    ctx.auth.user.id,
                    "Workflow"
                );

                const data = toTemplateData(workflow.nodes, workflow.connections);

                nodes = data.nodes;
                content = {
                    nodes: data.nodes as unknown as Prisma.InputJsonValue,
                    connections: data.connections as unknown as Prisma.InputJsonValue,
                    nodeTypes: data.nodeTypes,
                };
            }

            const findings = scanTemplateForSecrets(Array.isArray(nodes) ? nodes : []);

            if (findings.length > 0 && !confirmSecrets) {
                return { saved: false as const, findings };
            }

            const template = await prisma.workflowTemplate.update({
                where: { id },
                data: { ...fields, ...content },
                select: { id: true, name: true },
            });

            await recordAudit({
                userId: ctx.auth.user.id,
                action: "template.updated",
                target: templateAuditTarget(template, {
                    hidden: !fields.published,
                    secretsConfirmed: findings.length > 0,
                }),
            });

            return { saved: true as const, ...template };
        }),

    // ADMIN: workflows already made from the template are not affected
    remove: adminProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const deleted = await prisma.workflowTemplate.delete({
                where: { id: input.id },
                select: { id: true, name: true },
            });

            await recordAudit({
                userId: ctx.auth.user.id,
                action: "template.deleted",
                target: describeAuditTarget("Template", deleted),
            });

            return { id: input.id };
        }),
});
