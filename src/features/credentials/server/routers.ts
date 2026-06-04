import { PAGINATION } from "@/config/constants";
import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import z from "zod";
import { CredentialType } from "@prisma/client"
import { encrypt } from "@/lib/encryption";
import { PLAN_LIMITS } from "@/config/plans";
import { TRPCError } from "@trpc/server";


export const credentialsRouter = createTRPCRouter({



    // CREATE CREDENTIAL
    create: protectedProcedure
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
                        id: ctx.auth.user.id,
                    },
                });

            const credentialCount =
                await prisma.credential.count({
                    where: {
                        userId: ctx.auth.user.id,
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

            return prisma.credential.create({
                data: {
                    name,

                    userId: ctx.auth.user.id,

                    type,

                    value: encrypt(value),
                },
            });
        }),


    // DELETE CREDENTIAL
    remove: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(({ ctx, input }) => {
            return prisma.credential.delete({
                where: {
                    id: input.id,
                    userId: ctx.auth.user.id
                }
            })
        }),

    // UPDATE CREDENTIAL
    update: protectedProcedure
        .input(z.object({
            id: z.string(),
            name: z.string().min(1, "Name is required"),
            type: z.enum(CredentialType),
            value: z.string().min(1, "Value is required"),
        })
        )
        .mutation(({ ctx, input }) => {
            const { id, name, type, value } = input;

            return prisma.credential.update({
                where: { id, userId: ctx.auth.user.id },
                data: {
                    name,
                    type,
                    value: encrypt(value)
                }
            })
        }),

    // UPDATE ONE
    getOne: protectedProcedure
        .input(z.object({ id: z.string() }))
        .query(({ ctx, input }) => {
            return prisma.credential.findUniqueOrThrow({
                where: { id: input.id, userId: ctx.auth.user.id },
            })
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
                prisma.credential.findMany({
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
                    },
                }),
                prisma.credential.count({
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
    getByType: protectedProcedure
        .input(
            z.object({
                type: z.enum(CredentialType),
            })
        )
        .query(async ({ input, ctx }) => {
            const { type } = input;

            const credentials = await prisma.credential.findMany({
                where: { type, userId: ctx.auth.user.id },
                orderBy: {
                    updatedAt: "desc",
                },
            })
            return credentials;
        }),
});
