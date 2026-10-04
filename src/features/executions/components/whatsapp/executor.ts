import type { NodeExecutor } from "@/features/executions/types";
import { NonRetriableError } from "inngest";
import ky from "ky";
import { renderTemplate } from "../../lib/templates";
import {
  loadCredentialSecret,
  parseJsonField,
  toIntegrationError,
} from "../../lib/integration";

type WhatsappData = {
  variableName?: string;
  credentialId?: string;
  operation?: string;
  phoneNumberId?: string;
  to?: string;
  message?: string;
  templateName?: string;
  languageCode?: string;
  templateParamsJson?: string;
};

const GRAPH_API_VERSION = "v21.0";

export const whatsappExecutor: NodeExecutor<WhatsappData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
}) => {
  if (!data.variableName) {
    throw new NonRetriableError("WhatsApp node: Variable name is missing");
  }
  if (!data.operation) {
    throw new NonRetriableError("WhatsApp node: Operation is required");
  }

  const phoneNumberId = renderTemplate(data.phoneNumberId, context).trim();
  if (!/^\d+$/.test(phoneNumberId)) {
    throw new NonRetriableError(
      "WhatsApp node: Phone Number ID must contain digits only"
    );
  }

  // The API expects the number without "+", spaces or dashes
  const to = renderTemplate(data.to, context).replace(/[^\d]/g, "");
  if (!to) {
    throw new NonRetriableError("WhatsApp node: Recipient is required");
  }

  let payload: Record<string, unknown>;

  switch (data.operation) {
    case "send_text": {
      const body = renderTemplate(data.message, context).trim();
      if (!body) {
        throw new NonRetriableError("WhatsApp node: Message is required");
      }

      payload = { type: "text", text: { body, preview_url: false } };
      break;
    }

    case "send_template": {
      const name = renderTemplate(data.templateName, context).trim();
      if (!name) {
        throw new NonRetriableError("WhatsApp node: Template Name is required");
      }

      const rawParams = renderTemplate(data.templateParamsJson, context).trim();
      const params = rawParams
        ? parseJsonField<unknown[]>("WhatsApp", "Template Variables", rawParams)
        : [];

      if (!Array.isArray(params)) {
        throw new NonRetriableError(
          "WhatsApp node: Template Variables must be a JSON array"
        );
      }

      payload = {
        type: "template",
        template: {
          name,
          language: {
            code: renderTemplate(data.languageCode, context).trim() || "en_US",
          },
          ...(params.length > 0
            ? {
                components: [
                  {
                    type: "body",
                    parameters: params.map((value) => ({
                      type: "text",
                      text: String(value),
                    })),
                  },
                ],
              }
            : {}),
        },
      };
      break;
    }

    default:
      throw new NonRetriableError(
        `WhatsApp node: Unsupported operation "${data.operation}"`
      );
  }

  const token = await loadCredentialSecret({
    step,
    stepId: `whatsapp-${nodeId}-get-credential`,
    credentialId: data.credentialId,
    userId,
    label: "WhatsApp",
  });

  try {
    const result = await step.run(
      `whatsapp-${nodeId}-${data.operation}`,
      async () => {
        const response: any = await ky
          .post(
            `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
            {
              headers: { Authorization: `Bearer ${token}` },
              json: {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to,
                ...payload,
              },
            }
          )
          .json();

        return {
          messageId: response.messages?.[0]?.id,
          to: response.contacts?.[0]?.wa_id ?? to,
          status: response.messages?.[0]?.message_status ?? "accepted",
        };
      }
    );

    return {
      ...context,
      [data.variableName]: result,
    };
  } catch (error: any) {
    throw await toIntegrationError("WhatsApp", error);
  }
};
