import type { NodeExecutor } from "@/features/executions/types";
import { NonRetriableError } from "inngest";
import ky from "ky";
import { renderTemplate } from "../../lib/templates";
import {
  loadCredentialSecret,
  parseJsonField,
  toIntegrationError,
} from "../../lib/integration";

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
            const maxRecords = Math.min(
              Number(renderTemplate(data.maxRecords, context)) || 50,
              100
            );
            const formula = renderTemplate(data.filterByFormula, context).trim();

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
