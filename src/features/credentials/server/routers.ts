import { PAGINATION } from "@/config/constants";
import prisma from "@/lib/db";
import { createTRPCRouter, viewerProcedure, workspaceAdminProcedure } from "@/trpc/init";
import z from "zod";
import { CredentialType } from "@prisma/client"
import { encrypt } from "@/lib/encryption";
import { PLAN_LIMITS } from "@/config/plans";
import { TRPCError } from "@trpc/server";
import { assertOwnership } from "@/lib/ownership";
import { describeAuditTarget } from "@/lib/audit-actions";
import { recordAudit } from "@/lib/audit-log";

// What the browser may see of a credential. "value" (the encrypted secret)
// is never selected, so it cannot be sent by accident.
export const SAFE_CREDENTIAL_FIELDS = {
    id: true,
    name: true,
    type: true,
    createdAt: true,
    updatedAt: true,
} as const;


// Every procedure that takes a credential id starts here: one that does not
// exist and one that belongs to someone else are the same "not found"
const getOwnedCredential = async (id: string, userId: string) =>
    assertOwnership(
        await prisma.credential.findUnique({
            where: { id },
            select: { ...SAFE_CREDENTIAL_FIELDS, userId: true },
        }),
        userId,
        "Credential"
    );

export const credentialsRouter = createTRPCRouter({



    // CREATE CREDENTIAL
    create: workspaceAdminProcedure
        .input(
            z.object({
                name: z.string().min(1, "Name is required"),
                type: z.enum(CredentialType),
                value: z.string().min(1, "Value is required"),
            })
        )

        .mutation(async ({ ctx, input }) => {
            const { name, value, type } = input;

            const user =
                await prisma.user.findUniqueOrThrow({
                    where: {
                        id: ctx.workspace.ownerId,
                    },
                });

            const credentialCount =
                await prisma.credential.count({
                    where: {
                        userId: ctx.workspace.ownerId,
                    },
                });

            const credentialLimit =
                PLAN_LIMITS[user.plan].credentials;

            if (credentialCount >= credentialLimit) {
                throw new TRPCError({
                    code: "FORBIDDEN",

                    message: `Credential limit reached. Your current plan allows up to ${credentialLimit} credentials.`,
                });
            }

            const created = await prisma.credential.create({
                data: {
                    name,

                    userId: ctx.workspace.ownerId,
                    workspaceId: ctx.workspace.id,

                    type,

                    value: encrypt(value),
                },
                select: SAFE_CREDENTIAL_FIELDS,
            });

            await recordAudit({
                userId: ctx.workspace.ownerId,
                actor: ctx.workspace.actor,
                action: "credential.created",
                target: describeAuditTarget(`${type} credential`, { name, id: created.id }),
            });

            return created;
        }),


    // DELETE CREDENTIAL
    remove: workspaceAdminProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await getOwnedCredential(input.id, ctx.workspace.ownerId);

            const deleted = await prisma.credential.delete({
                where: {
                    id: input.id,
                    userId: ctx.workspace.ownerId
                },
                select: SAFE_CREDENTIAL_FIELDS,
            })

            await recordAudit({
                userId: ctx.workspace.ownerId,
                actor: ctx.workspace.actor,
                action: "credential.deleted",
                target: describeAuditTarget(`${deleted.type} credential`, deleted),
            });

            return deleted;
        }),

    // UPDATE CREDENTIAL
    update: workspaceAdminProcedure
        .input(z.object({
            id: z.string(),
            name: z.string().min(1, "Name is required"),
            type: z.enum(CredentialType),
            // The saved secret is never sent to the form. Empty or left out
            // means "keep it"; anything else replaces it.
            value: z.string().optional(),
        })
        )
        .mutation(async ({ ctx, input }) => {
            const { id, name, type, value } = input;

            // Without a new secret the type stays too: the saved secret
            // belongs to the type it was entered for
            const replaceSecret = !!value;

            await getOwnedCredential(id, ctx.workspace.ownerId);

            const updated = await prisma.credential.update({
                where: { id, userId: ctx.workspace.ownerId },
                data: {
                    name,
                    ...(replaceSecret ? { type, value: encrypt(value) } : {}),
                },
                select: SAFE_CREDENTIAL_FIELDS,
            })

            await recordAudit({
                userId: ctx.workspace.ownerId,
                actor: ctx.workspace.actor,
                action: "credential.updated",
                // Says whether the secret itself was replaced, never what it is
                target:
                    describeAuditTarget(`${updated.type} credential`, updated) +
                    (replaceSecret ? ", secret replaced" : ", name changed"),
            });

            return updated;
        }),

    // GET ONE
    getOne: workspaceAdminProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ ctx, input }) => {
            // The owner id was only needed for the check
            const { userId: _owner, ...credential } = await getOwnedCredential(
                input.id,
                ctx.workspace.ownerId
            )

            // All the form learns about the secret: that one is saved
            return { ...credential, hasSecret: true }
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
                prisma.credential.findMany({
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
                    },
                    select: SAFE_CREDENTIAL_FIELDS,
                }),
                prisma.credential.count({
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
    getByType: viewerProcedure
        .input(
            z.object({
                type: z.enum(CredentialType),
            })
        )
        .query(async ({ input, ctx }) => {
            const { type } = input;

            const credentials = await prisma.credential.findMany({
                where: { type, userId: ctx.workspace.ownerId },
                orderBy: {
                    updatedAt: "desc",
                },
                select: SAFE_CREDENTIAL_FIELDS,
            })
            return credentials;
        }),
});
