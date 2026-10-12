import type { NodeExecutor } from "@/features/executions/types";
import { NonRetriableError } from "inngest";
import ky from "ky";
import { renderTemplate } from "../../lib/templates";
import {
  loadCredentialSecret,
  parseJsonField,
  toIntegrationError,
} from "../../lib/integration";
import { MAX_ITEMS_PER_NODE } from "@/inngest/items";

type AirtableData = {
  variableName?: string;
  credentialId?: string;
  operation?: string;
  baseId?: string;
  table?: string;
  recordId?: string;
  fieldsJson?: string;
  filterByFormula?: string;
  maxRecords?: string;
  // "yes": List Records follows Airtable's pages up to Max Records
  returnAll?: string | boolean;
};

// Airtable returns at most this many records per request
const AIRTABLE_PAGE_SIZE = 100;
export const AIRTABLE_RETURN_ALL_DEFAULT = 1000;
export const AIRTABLE_RETURN_ALL_MAX = 10_000;
// Step results are stored by Inngest, which caps their size
const MAX_LIST_BYTES = 3 * 1024 * 1024;

/**
 * Max Records with Return All on: 1000 when it is empty or not a number,
 * 10,000 at most, so a huge base cannot keep a run going forever.
 */
export const resolveReturnAllLimit = (value: unknown): number => {
  const limit = Math.floor(Number(String(value ?? "").trim()));

  if (!Number.isFinite(limit) || limit < 1) return AIRTABLE_RETURN_ALL_DEFAULT;

  return Math.min(limit, AIRTABLE_RETURN_ALL_MAX);
};

type AirtablePage = { records?: unknown[]; offset?: string };

/**
 * Reads a table page by page: Airtable answers with an `offset` while there
 * are more records, and the next request sends it back. Stops at `limit`
 * records, or earlier when the list would be too large to store.
 * `truncated` says that the table (or the filter) had more.
 */
export const listAllAirtableRecords = async <T = unknown>(
  fetchPage: (offset: string | undefined) => Promise<AirtablePage>,
  { limit, maxBytes = MAX_LIST_BYTES }: { limit: number; maxBytes?: number }
): Promise<{ records: T[]; truncated: boolean; reason?: "maxRecords" | "size" }> => {
  const records: T[] = [];
  let offset: string | undefined;
  let bytes = 0;

  // One more than the pages `limit` needs: never an endless loop, whatever
  // the server answers
  for (let page = 0; page <= Math.ceil(limit / AIRTABLE_PAGE_SIZE); page++) {
    const response = await fetchPage(offset);

    for (const record of response.records ?? []) {
      if (records.length >= limit) return { records, truncated: true, reason: "maxRecords" };

      bytes += Buffer.byteLength(JSON.stringify(record));
      if (bytes > maxBytes) return { records, truncated: true, reason: "size" };

      records.push(record as T);
    }

    offset = response.offset || undefined;
    if (!offset) return { records, truncated: false };
    // Full, and Airtable says there is more: no need to ask for it
    if (records.length >= limit) return { records, truncated: true, reason: "maxRecords" };
  }

  return { records, truncated: true, reason: "maxRecords" };
};

/**
 * What a Return All list says about itself, so a workflow (and the person
 * reading the execution) can tell a complete list from one that was cut.
 */
export const describeAirtableList = ({
  count,
  limit,
  truncated,
  reason,
  itemLimit = MAX_ITEMS_PER_NODE,
}: {
  count: number;
  limit: number;
  truncated: boolean;
  reason?: "maxRecords" | "size";
  itemLimit?: number;
}) => {
  const warnings: string[] = [];

  if (truncated) {
    warnings.push(
      reason === "size"
        ? `Only the first ${count} records were returned: more would be too large to store (3 MB). Narrow the Filter Formula.`
        : `Only the first ${count} records were returned: the table has more than Max Records (${limit}). Raise Max Records (up to ${AIRTABLE_RETURN_ALL_MAX}) or narrow the Filter Formula.`
    );
  }

  if (count > itemLimit) {
    warnings.push(
      `${count} records are more than the ${itemLimit} items a node after Split Out handles: add a Limit node, or process the list in smaller parts.`
    );
  }

  return {
    returnAll: true,
    maxRecords: limit,
    // More records matched than were returned
    truncated,
    ...(warnings.length > 0 ? { warning: warnings.join(" ") } : {}),
  };
};

const summarizeRecord = (record: any) => ({
  id: record.id,
  fields: record.fields,
  createdTime: record.createdTime,
});

export const airtableExecutor: NodeExecutor<AirtableData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
}) => {
  if (!data.variableName) {
    throw new NonRetriableError("Airtable node: Variable name is missing");
  }
  if (!data.operation) {
    throw new NonRetriableError("Airtable node: Operation is required");
  }

  const baseId = renderTemplate(data.baseId, context).trim();
  const table = renderTemplate(data.table, context).trim();

  if (!baseId || !table) {
    throw new NonRetriableError("Airtable node: Base ID and Table are required");
  }

  const token = await loadCredentialSecret({
    step,
    stepId: `airtable-${nodeId}-get-credential`,
    credentialId: data.credentialId,
    userId,
    label: "Airtable",
  });

  const baseUrl = `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`;

  const api = ky.create({
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const getRecordId = () => {
    const recordId = renderTemplate(data.recordId, context).trim();
    if (!recordId) {
      throw new NonRetriableError("Airtable node: Record ID is required");
    }
    return encodeURIComponent(recordId);
  };

  const getFields = () =>
    parseJsonField<Record<string, unknown>>(
      "Airtable",
      "Fields JSON",
      renderTemplate(data.fieldsJson, context) || "{}"
    );

  try {
    const result = await step.run(
      `airtable-${nodeId}-${data.operation}`,
      async () => {
        switch (data.operation) {
          case "list_records": {
            const formula = renderTemplate(data.filterByFormula, context).trim();

            if (data.returnAll === true || data.returnAll === "yes" || data.returnAll === "true") {
              const limit = resolveReturnAllLimit(renderTemplate(data.maxRecords, context));

              const { records, truncated, reason } = await listAllAirtableRecords<any>(
                (offset) =>
                  api
                    .get(baseUrl, {
                      searchParams: {
                        pageSize: AIRTABLE_PAGE_SIZE,
                        ...(formula ? { filterByFormula: formula } : {}),
                        ...(offset ? { offset } : {}),
                      },
                    })
                    .json<AirtablePage>(),
                { limit }
              );

              return {
                records: records.map(summarizeRecord),
                count: records.length,
                ...describeAirtableList({ count: records.length, limit, truncated, reason }),
              };
            }

            const maxRecords = Math.min(
              Number(renderTemplate(data.maxRecords, context)) || 50,
              100
            );

            const response: any = await api
              .get(baseUrl, {
                searchParams: {
                  maxRecords,
                  ...(formula ? { filterByFormula: formula } : {}),
                },
              })
              .json();

            return {
              records: response.records.map(summarizeRecord),
              count: response.records.length,
            };
          }

          case "create_record": {
            const record: any = await api
              .post(baseUrl, { json: { fields: getFields(), typecast: true } })
              .json();

            return summarizeRecord(record);
          }

          case "update_record": {
            const record: any = await api
              .patch(`${baseUrl}/${getRecordId()}`, {
                json: { fields: getFields(), typecast: true },
              })
              .json();

            return summarizeRecord(record);
          }

          case "delete_record": {
            const response: any = await api.delete(`${baseUrl}/${getRecordId()}`).json();

            return { id: response.id, deleted: response.deleted };
          }

          default:
            throw new NonRetriableError(
              `Airtable node: Unsupported operation "${data.operation}"`
            );
        }
      }
    );

    return {
      ...context,
      [data.variableName]: result,
    };
  } catch (error: any) {
    throw await toIntegrationError("Airtable", error);
  }
};
