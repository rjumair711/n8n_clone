import type { NodeExecutor } from "@/features/executions/types";
import { NonRetriableError } from "inngest";
import Handlebars from "handlebars";
import ky from "ky";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { NotionNodeData } from "./node";

export const notionExecutor: NodeExecutor<NotionNodeData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
}) => {
  // 1. Validations
  if (!data.variableName) {
    throw new NonRetriableError("Notion node: Variable name is missing");
  }
  if (!data.credentialId) {
    throw new NonRetriableError("Notion node: Credential ID is required");
  }
  if (!data.databaseId) {
    throw new NonRetriableError("Notion node: Database ID is required");
  }
  if (!data.operation) {
    throw new NonRetriableError("Notion node: Operation type is required");
  }

  // 2. Fetch credential (same pattern as OpenAI executor)
  const credential = await step.run(
    `notion-${nodeId}-get-credential`,
    async () => {
      return prisma.credential.findUnique({
        where: {
          id: data.credentialId,
          userId,
        },
      });
    }
  );

  if (!credential) {
    throw new NonRetriableError(
      "Notion node: Credential not found"
    );
  }

  // 3. Decrypt token and resolve Handlebars vars
  const accessToken = decrypt(credential.value);
  const databaseId = Handlebars.compile(data.databaseId)(context).trim();

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };

  try {
    if (data.operation === "create_page") {
      const result = await step.run(
        `notion-${nodeId}-create-page`,
        async () => {
          const rawProperties = Handlebars.compile(
            data.propertiesJson || "{}"
          )(context);

          let propertiesPayload: Record<string, unknown>;
          try {
            propertiesPayload = JSON.parse(rawProperties);
          } catch {
            throw new NonRetriableError(
              "Notion node: Invalid JSON in Properties field"
            );
          }

          const response: any = await ky
            .post("https://api.notion.com/v1/pages", {
              headers,
              json: {
                parent: { database_id: databaseId },
                properties: propertiesPayload,
              },
            })
            .json();

          return {
            ...context,
            [data.variableName!]: {
              id: response.id,
              url: response.url,
              properties: response.properties,
            },
          };
        }
      );

      return result;
    }

    if (data.operation === "query_database") {
      const result = await step.run(
        `notion-${nodeId}-query-database`,
        async () => {
          const response: any = await ky
            .post(
              `https://api.notion.com/v1/databases/${databaseId}/query`,
              {
                headers,
                json: {},
              }
            )
            .json();

          return {
            ...context,
            [data.variableName!]: {
              results: response.results.map((item: any) => ({
                id: item.id,
                url: item.url,
                properties: item.properties,
              })),
              hasMore: response.has_more,
            },
          };
        }
      );

      return result;
    }

    throw new NonRetriableError(
      `Notion node: Unsupported operation "${data.operation}"`
    );
  } catch (error: any) {
    if (error instanceof NonRetriableError) {
      throw error;
    }

    if (error.response) {
      const errorBody = await error.response.json().catch(() => ({}));
      throw new NonRetriableError(
        `Notion API error [${error.response.status}]: ${errorBody.message || error.message}`
      );
    }

    throw new NonRetriableError(`Notion node failed: ${error.message}`);
  }
};