import type { NodeExecutor } from "@/features/executions/types";
import { NonRetriableError } from "inngest";
import ky from "ky";
import { renderTemplate } from "../../lib/templates";
import {
  loadCredentialSecret,
  parseJsonField,
  toIntegrationError,
} from "../../lib/integration";
import { loadFiles, resolveFileId } from "../files/executors";

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
  // send_document: a file variable, and an optional caption
  file?: string;
  caption?: string;
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
  // send_document: the file is uploaded to Meta first, then sent by its id
  let documentId: string | null = null;
  const caption = renderTemplate(data.caption, context).trim();

  switch (data.operation) {
    case "send_document":
      documentId = resolveFileId("WhatsApp", context, data.file);
      payload = {};
      break;

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
        if (documentId) {
          const [file] = await loadFiles("WhatsApp", [documentId], userId);

          const form = new FormData();
          form.set("messaging_product", "whatsapp");
          form.set("type", file.mimeType);
          form.set(
            "file",
            new Blob([new Uint8Array(file.data)], { type: file.mimeType }),
            file.fileName
          );

          const media: any = await ky
            .post(
              `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/media`,
              {
                headers: { Authorization: `Bearer ${token}` },
                body: form,
                timeout: 60_000,
              }
            )
            .json();

          // Pictures, video and audio show inline; everything else is a document
          const kind = file.mimeType.startsWith("image/")
            ? "image"
            : file.mimeType.startsWith("video/")
              ? "video"
              : file.mimeType.startsWith("audio/")
                ? "audio"
                : "document";

          payload = {
            type: kind,
            [kind]: {
              id: media.id,
              ...(kind === "document" ? { filename: file.fileName } : {}),
              // Audio messages cannot carry a caption
              ...(caption && kind !== "audio" ? { caption } : {}),
            },
          };
        }

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
