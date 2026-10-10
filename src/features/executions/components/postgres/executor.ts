import type { NodeExecutor } from "@/features/executions/types";
import { NonRetriableError } from "inngest";
import { Client } from "pg";
import { assertPublicHost } from "@/lib/ssrf";
import { renderTemplate } from "../../lib/templates";
import { loadCredentialSecret, parseJsonField } from "../../lib/integration";
import { resolveQueryParameters, resolveQueryText } from "../../lib/sql-safety";

type PostgresData = {
  variableName?: string;
  credentialId?: string;
  operation?: string;
  query?: string;
  paramsJson?: string;
  allowQueryExpressions?: string;
  table?: string;
  limit?: string;
  rowJson?: string;
};

const MAX_ROWS = 500;
const CONNECT_TIMEOUT_MS = 10_000;
const QUERY_TIMEOUT_MS = 20_000;

// Table and column names cannot be query parameters, so they are quoted
const quoteIdentifier = (identifier: string) =>
  identifier
    .split(".")
    .map((part) => `"${part.trim().replace(/"/g, '""')}"`)
    .join(".");

export const postgresExecutor: NodeExecutor<PostgresData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
}) => {
  if (!data.variableName) {
    throw new NonRetriableError("Postgres node: Variable name is missing");
  }
  if (!data.operation) {
    throw new NonRetriableError("Postgres node: Operation is required");
  }

  // Build the statement first so configuration mistakes fail before connecting
  let text: string;
  let values: unknown[] = [];

  switch (data.operation) {
    case "execute_query": {
      // Expressions in the SQL itself are refused unless the node allows
      // them; values go through Query Parameters, which pg sends apart
      // from the SQL
      text = resolveQueryText("Postgres", data, context);
      values = resolveQueryParameters("Postgres", data.paramsJson, context);
      break;
    }

    case "select_rows": {
      const table = renderTemplate(data.table, context).trim();
      if (!table) {
        throw new NonRetriableError("Postgres node: Table is required");
      }

      const limit = Math.min(
        Number(renderTemplate(data.limit, context)) || 50,
        MAX_ROWS
      );

      text = `SELECT * FROM ${quoteIdentifier(table)} LIMIT $1`;
      values = [limit];
      break;
    }

    case "insert_row": {
      const table = renderTemplate(data.table, context).trim();
      if (!table) {
        throw new NonRetriableError("Postgres node: Table is required");
      }

      const row = parseJsonField<Record<string, unknown>>(
        "Postgres",
        "Row JSON",
        renderTemplate(data.rowJson, context) || "{}"
      );
      const columns = Object.keys(row);

      if (columns.length === 0) {
        throw new NonRetriableError(
          "Postgres node: Row JSON needs at least one column"
        );
      }

      text = `INSERT INTO ${quoteIdentifier(table)} (${columns
        .map(quoteIdentifier)
        .join(", ")}) VALUES (${columns
        .map((_, index) => `$${index + 1}`)
        .join(", ")}) RETURNING *`;
      values = columns.map((column) => row[column]);
      break;
    }

    default:
      throw new NonRetriableError(
        `Postgres node: Unsupported operation "${data.operation}"`
      );
  }

  const connectionString = await loadCredentialSecret({
    step,
    stepId: `postgres-${nodeId}-get-credential`,
    credentialId: data.credentialId,
    userId,
    label: "Postgres",
  });

  try {
    const result = await step.run(
      `postgres-${nodeId}-${data.operation}`,
      async () => {
        // The host comes from the user: never connect into a private
        // network, unless it is listed in PRIVATE_NETWORK_ALLOWLIST
        let host = "";
        let port = 5432;
        try {
          const url = new URL(connectionString);
          host = url.hostname;
          if (url.port) port = Number(url.port);
        } catch {
          // Not a URL (key=value form): pg reports what is wrong with it
        }
        if (host) await assertPublicHost(host, port);

        const client = new Client({
          connectionString,
          connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
          statement_timeout: QUERY_TIMEOUT_MS,
          query_timeout: QUERY_TIMEOUT_MS,
        });

        await client.connect();

        try {
          const response = await client.query(text, values);
          const rows = response.rows ?? [];

          return {
            rows: rows.slice(0, MAX_ROWS),
            rowCount: response.rowCount ?? rows.length,
            truncated: rows.length > MAX_ROWS,
          };
        } finally {
          await client.end().catch(() => {});
        }
      }
    );

    return {
      ...context,
      [data.variableName]: result,
    };
  } catch (error: any) {
    if (error instanceof NonRetriableError) throw error;

    throw new NonRetriableError(`Postgres node failed: ${error.message}`);
  }
};
