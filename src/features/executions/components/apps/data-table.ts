import { NonRetriableError } from "inngest";
import type { Prisma } from "@prisma/client";
import type { NodeExecutor } from "@/features/executions/types";
import prisma from "@/lib/db";
import { renderTemplate } from "../../lib/templates";
import {
  DATA_TABLE_LIMITS,
  clampListLimit,
  isDataTableOperation,
  mergeRowData,
  normalizeRowKey,
  normalizeTableName,
  parseRowData,
} from "../../lib/data-table";

// Data Table: rows by key in a named table of the workflow owner's account.
// See lib/data-table.ts for the rules and Settings → Data tables for the
// page that shows them.

type DataTableData = {
  variableName?: string;
  operation?: string;
  tableName?: string;
  key?: string;
  rowData?: string;
  limit?: string;
};

const label = "Data Table";

export const dataTableExecutor: NodeExecutor<DataTableData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
}) => {
  const variableName = data.variableName?.trim() || "dataTable";
  const operation = data.operation || "upsert_row";
  if (!isDataTableOperation(operation)) {
    throw new NonRetriableError(`${label} node: Unsupported operation "${operation}"`);
  }

  let tableName: string;
  let key = "";
  let patch: Record<string, unknown> = {};
  try {
    tableName = normalizeTableName(renderTemplate(data.tableName, context));
    if (operation !== "list_rows") key = normalizeRowKey(renderTemplate(data.key, context));
    if (operation === "upsert_row") patch = parseRowData(renderTemplate(data.rowData, context));
  } catch (error) {
    throw new NonRetriableError(`${label} node: ${error instanceof Error ? error.message : "invalid settings"}`);
  }

  try {
    const result = await step.run(`data-table-${nodeId}-${operation}`, async () => {
      const table = await prisma.dataTable.findUnique({
        where: { userId_name: { userId, name: tableName } },
        select: { id: true },
      });

      // Reading a table that was never written to is not an error
      if (!table && operation !== "upsert_row") {
        if (operation === "list_rows") return { table: tableName, rows: [], count: 0 };
        if (operation === "find_row") return { table: tableName, key, exists: false };
        if (operation === "delete_row") return { table: tableName, key, deleted: false };
        return { table: tableName, key, found: false, data: null };
      }

      switch (operation) {
        case "upsert_row": {
          const tableId =
            table?.id ??
            (await (async () => {
              const count = await prisma.dataTable.count({ where: { userId } });
              if (count >= DATA_TABLE_LIMITS.tablesPerAccount) {
                throw new NonRetriableError(`${label} node: An account can have ${DATA_TABLE_LIMITS.tablesPerAccount} data tables; delete one in Settings → Data tables`);
              }
              // Two runs creating the same table at once: the second finds it
              const created = await prisma.dataTable.upsert({
                where: { userId_name: { userId, name: tableName } },
                create: { userId, name: tableName },
                update: {},
                select: { id: true },
              });
              return created.id;
            })());

          const existing = await prisma.dataTableRow.findUnique({
            where: { tableId_key: { tableId, key } },
            select: { data: true },
          });
          if (!existing) {
            const rows = await prisma.dataTableRow.count({ where: { tableId } });
            if (rows >= DATA_TABLE_LIMITS.rowsPerTable) {
              throw new NonRetriableError(`${label} node: "${tableName}" has ${DATA_TABLE_LIMITS.rowsPerTable.toLocaleString("en-US")} rows, the most a table can have. Delete old rows first`);
            }
          }
          let merged: Prisma.InputJsonValue;
          try {
            merged = mergeRowData(existing?.data, patch) as Prisma.InputJsonValue;
          } catch (error) {
            throw new NonRetriableError(`${label} node: ${error instanceof Error ? error.message : "row too large"}`);
          }
          await prisma.dataTableRow.upsert({
            where: { tableId_key: { tableId, key } },
            create: { tableId, key, data: merged },
            update: { data: merged },
          });
          return { table: tableName, key, created: !existing, data: merged };
        }

        case "get_row": {
          const row = await prisma.dataTableRow.findUnique({
            where: { tableId_key: { tableId: table!.id, key } },
            select: { data: true, updatedAt: true },
          });
          return row
            ? { table: tableName, key, found: true, data: row.data, updatedAt: row.updatedAt.toISOString() }
            : { table: tableName, key, found: false, data: null };
        }

        case "find_row": {
          const row = await prisma.dataTableRow.findUnique({
            where: { tableId_key: { tableId: table!.id, key } },
            select: { id: true },
          });
          return { table: tableName, key, exists: !!row };
        }

        case "delete_row": {
          const removed = await prisma.dataTableRow.deleteMany({ where: { tableId: table!.id, key } });
          return { table: tableName, key, deleted: removed.count > 0 };
        }

        case "list_rows": {
          const rows = await prisma.dataTableRow.findMany({
            where: { tableId: table!.id },
            orderBy: { updatedAt: "desc" },
            take: clampListLimit(data.limit),
            select: { key: true, data: true, updatedAt: true },
          });
          return {
            table: tableName,
            rows: rows.map((row) => ({ key: row.key, data: row.data, updatedAt: row.updatedAt.toISOString() })),
            count: rows.length,
          };
        }
      }
    });

    return { ...context, [variableName]: result };
  } catch (error) {
    if (error instanceof NonRetriableError) throw error;
    throw new NonRetriableError(`${label} node: ${error instanceof Error ? error.message : "failed"}`);
  }
};
