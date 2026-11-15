import z from "zod";
import prisma from "@/lib/db";
import { createTRPCRouter, editorProcedure, viewerProcedure } from "@/trpc/init";

// Settings → AI → Contact memory: the long-term facts AI agents saved about
// contacts (Postgres Memory's "Long-Term Facts"), so the owner can see what
// is kept and delete it, for example when a customer asks.
// The facts belong to the workspace owner's account, like the workflows.

const CONTACTS_PER_PAGE = 25;

export const memoryRouter = createTRPCRouter({
    // Contacts with facts, newest change first, with their facts
    listContacts: viewerProcedure
        .input(
            z.object({
                search: z.string().max(200).default(""),
                page: z.number().int().min(1).max(10_000).default(1),
            })
        )
        .query(async ({ ctx, input }) => {
            const userId = ctx.workspace.ownerId;
            const search = input.search.trim();
            const where = {
                userId,
                ...(search
                    ? {
                        OR: [
                            { contactId: { contains: search, mode: "insensitive" as const } },
                            { value: { contains: search, mode: "insensitive" as const } },
                        ],
                    }
                    : {}),
            };

            const [groups, total] = await Promise.all([
                prisma.contactFact.groupBy({
                    by: ["contactId"],
                    where,
                    _count: { _all: true },
                    _max: { updatedAt: true },
                    orderBy: { _max: { updatedAt: "desc" } },
                    skip: (input.page - 1) * CONTACTS_PER_PAGE,
                    take: CONTACTS_PER_PAGE,
                }),
                prisma.contactFact
                    .groupBy({ by: ["contactId"], where })
                    .then((rows) => rows.length),
            ]);

            const facts = groups.length
                ? await prisma.contactFact.findMany({
                    where: { userId, contactId: { in: groups.map((group) => group.contactId) } },
                    orderBy: { key: "asc" },
                    select: { id: true, contactId: true, key: true, value: true, updatedAt: true },
                })
                : [];

            return {
                contacts: groups.map((group) => ({
                    contactId: group.contactId,
                    factCount: group._count._all,
                    updatedAt: group._max.updatedAt,
                    facts: facts.filter((fact) => fact.contactId === group.contactId),
                })),
                total,
                totalPages: Math.max(1, Math.ceil(total / CONTACTS_PER_PAGE)),
                page: input.page,
            };
        }),

    // One fact
    deleteFact: editorProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            // Only the owner's own facts: someone else's id deletes nothing
            const removed = await prisma.contactFact.deleteMany({
                where: { id: input.id, userId: ctx.workspace.ownerId },
            });
            return { deleted: removed.count };
        }),

    // Everything remembered about one contact
    deleteContact: editorProcedure
        .input(z.object({ contactId: z.string().min(1).max(500) }))
        .mutation(async ({ ctx, input }) => {
            const removed = await prisma.contactFact.deleteMany({
                where: { contactId: input.contactId, userId: ctx.workspace.ownerId },
            });
            return { deleted: removed.count };
        }),
});
