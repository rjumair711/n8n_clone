import z from "zod";
import prisma from "@/lib/db";
import { createTRPCRouter, editorProcedure, viewerProcedure } from "@/trpc/init";

// Settings → Workspace → Data tables: the Data Table node's tables of the
// workspace owner's account, to look at and clean up.

const ROWS_PER_PAGE = 50;

export const dataTablesRouter = createTRPCRouter({
    listTables: viewerProcedure.query(async ({ ctx }) => {
        const tables = await prisma.dataTable.findMany({
            where: { userId: ctx.workspace.ownerId },
            orderBy: { updatedAt: "desc" },
            select: { id: true, name: true, updatedAt: true, _count: { select: { rows: true } } },
        });
        return tables.map((table) => ({
            id: table.id,
            name: table.name,
            updatedAt: table.updatedAt,
            rowCount: table._count.rows,
        }));
    }),

    listRows: viewerProcedure
        .input(
            z.object({
                tableId: z.string(),
                search: z.string().max(200).default(""),
                page: z.number().int().min(1).max(10_000).default(1),
            })
        )
        .query(async ({ ctx, input }) => {
            const table = await prisma.dataTable.findFirst({
                where: { id: input.tableId, userId: ctx.workspace.ownerId },
                select: { id: true, name: true },
            });
            if (!table) return { table: null, rows: [], total: 0, totalPages: 1, page: 1 };

            const where = {
                tableId: table.id,
                ...(input.search.trim() ? { key: { contains: input.search.trim(), mode: "insensitive" as const } } : {}),
            };
            const [rows, total] = await Promise.all([
                prisma.dataTableRow.findMany({
                    where,
                    orderBy: { updatedAt: "desc" },
                    skip: (input.page - 1) * ROWS_PER_PAGE,
                    take: ROWS_PER_PAGE,
                    select: { id: true, key: true, data: true, updatedAt: true },
                }),
                prisma.dataTableRow.count({ where }),
            ]);
            return {
                table,
                rows,
                total,
                totalPages: Math.max(1, Math.ceil(total / ROWS_PER_PAGE)),
                page: input.page,
            };
        }),

    deleteRow: editorProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const removed = await prisma.dataTableRow.deleteMany({
                where: { id: input.id, table: { userId: ctx.workspace.ownerId } },
            });
            return { deleted: removed.count };
        }),

    // The table and all of its rows. A workflow that writes to it again
    // makes a new, empty one
    deleteTable: editorProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const removed = await prisma.dataTable.deleteMany({
                where: { id: input.id, userId: ctx.workspace.ownerId },
            });
            return { deleted: removed.count };
        }),
});
