import type { NodeExecutor } from "@/features/executions/types";
import { NonRetriableError } from "inngest";
import prisma from "@/lib/db";
import {
  SALESFORCE_API_VERSION,
  getSalesforceAccess,
} from "@/lib/salesforce-oauth";
import { renderTemplate } from "../../lib/templates";
import { parseJsonField } from "../../lib/integration";

type SalesforceData = {
  variableName?: string;
  credentialId?: string;
  operation?: string;
  // The API name of the object: Lead, Contact, Account, Opportunity, Order__c...
  object?: string;
  recordId?: string;
  fieldsJson?: string;
  query?: string;
};

// Every record comes with an "attributes" block describing it; the data is
// easier to use without
const stripAttributes = (record: any): any => {
  if (Array.isArray(record)) return record.map(stripAttributes);
  if (record === null || typeof record !== "object") return record;

  const { attributes: _attributes, ...fields } = record;

  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, stripAttributes(value)])
  );
};

export const salesforceExecutor: NodeExecutor<SalesforceData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
}) => {
  if (!data.variableName) {
    throw new NonRetriableError("Salesforce node: Variable name is missing");
  }
  if (!data.credentialId) {
    throw new NonRetriableError("Salesforce node: Credential is required");
  }

  const variableName = data.variableName;
  const operation = data.operation || "query";
  const field = (name: keyof SalesforceData) =>
    renderTemplate(data[name], context).trim();

  // Object names and record ids become part of the URL, so they are
  // checked instead of trusted
  const objectName = () => {
    const name = field("object");
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
      throw new NonRetriableError(
        "Salesforce node: Object must be an API name such as Lead, Contact or Invoice__c"
      );
    }
    return name;
  };

  const recordId = () => {
    const id = field("recordId");
    if (!/^[A-Za-z0-9]{15}([A-Za-z0-9]{3})?$/.test(id)) {
      throw new NonRetriableError(
        "Salesforce node: Record ID must be a 15 or 18 character Salesforce ID"
      );
    }
    return id;
  };

  const fields = () => {
    const parsed = parseJsonField<unknown>(
      "Salesforce",
      "Fields",
      field("fieldsJson") || "{}"
    );

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      Object.keys(parsed).length === 0
    ) {
      throw new NonRetriableError(
        "Salesforce node: Fields must be a JSON object with at least one field"
      );
    }

    return parsed;
  };

  let request: { method: string; path: string; body?: unknown };
  let shape: (response: any) => unknown;

  switch (operation) {
    case "query": {
      const soql = field("query");
      if (!soql) {
        throw new NonRetriableError("Salesforce node: Query is required");
      }

      request = {
        method: "GET",
        path: `/query?q=${encodeURIComponent(soql)}`,
      };
      shape = (response) => {
        const records = stripAttributes(response.records ?? []);

        return {
          records,
          count: records.length,
          totalSize: response.totalSize,
          // More rows exist than one request returns
          done: response.done,
        };
      };
      break;
    }

    case "create_record":
      request = {
        method: "POST",
        path: `/sobjects/${objectName()}`,
        body: fields(),
      };
      shape = (response) => ({ id: response.id, success: response.success });
      break;

    case "get_record":
      request = {
        method: "GET",
        path: `/sobjects/${objectName()}/${recordId()}`,
      };
      shape = stripAttributes;
      break;

    case "update_record": {
      const id = recordId();
      request = {
        method: "PATCH",
        path: `/sobjects/${objectName()}/${id}`,
        body: fields(),
      };
      shape = () => ({ id, updated: true });
      break;
    }

    case "delete_record": {
      const id = recordId();
      request = {
        method: "DELETE",
        path: `/sobjects/${objectName()}/${id}`,
      };
      shape = () => ({ id, deleted: true });
      break;
    }

    default:
      throw new NonRetriableError(
        `Salesforce node: Unsupported operation "${operation}"`
      );
  }

  // Only the encrypted row passes through the step
  const credential = await step.run(`salesforce-${nodeId}-get-credential`, async () => {
    return prisma.credential.findUnique({
      where: { id: data.credentialId, userId },
    });
  });

  if (!credential) {
    throw new NonRetriableError("Salesforce node: Credential not found");
  }

  try {
    const result = await step.run(`salesforce-${nodeId}-${operation}`, async () => {
      const { accessToken, instanceUrl } = await getSalesforceAccess(
        credential.value
      );

      const response = await fetch(
        `${instanceUrl}/services/data/${SALESFORCE_API_VERSION}${request.path}`,
        {
          method: request.method,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
            ...(request.body ? { "Content-Type": "application/json" } : {}),
          },
          body: request.body ? JSON.stringify(request.body) : undefined,
          signal: AbortSignal.timeout(30_000),
        }
      );

      // Update and delete answer 204 with no body
      const text = await response.text();
      let payload: any = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        // Reported below when the request failed
      }

      if (!response.ok) {
        // Errors arrive as a list: [{ message, errorCode }]
        const detail = Array.isArray(payload)
          ? payload
              .map((entry) => `${entry.errorCode}: ${entry.message}`)
              .join("; ")
          : text.slice(0, 300);

        throw new NonRetriableError(
          `Salesforce API error [${response.status}]: ${detail || response.statusText}`
        );
      }

      return shape(payload ?? {});
    });

    return { ...context, [variableName]: result };
  } catch (error: any) {
    if (error instanceof NonRetriableError) throw error;

    throw new NonRetriableError(`Salesforce node failed: ${error?.message}`);
  }
};
