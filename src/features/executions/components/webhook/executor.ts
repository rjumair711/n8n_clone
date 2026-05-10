import { webhookChannel } from "@/inngest/channels/webhookResponse";
import { NodeExecutor } from "../../types";
import { NonRetriableError } from "inngest";
import ky from "ky";

type WebhookResponseData = {
  responseMessage: string;
  responseStatus: "success" | "error";
  webhookUrl?: string;
  variableName?: string;
};

export const webhookResponseExecutor: NodeExecutor<WebhookResponseData> = async ({
  data,
  context,
  step,
  publish,
  nodeId
}) => {
  const { responseMessage, responseStatus, webhookUrl, variableName } = data;

  // FIX 1: Merge the ID into the first argument of publish
  await publish({
    ...webhookChannel().status({
      nodeId: nodeId,
      status: "loading",
      message: "Processing Webhook Response...",
    }),
    id: `status-loading-${nodeId}`
  });

  // Validation logic
  if (!responseMessage || !responseStatus) {
    await publish({
      ...webhookChannel().status({
        nodeId: nodeId,
        status: "error",
        message: "Response message or status is missing",
      }),
      id: `status-error-missing-fields-${nodeId}`
    });
    throw new NonRetriableError("Webhook Response node requires responseMessage and responseStatus");
  }

  if (!webhookUrl) {
    await publish({
      ...webhookChannel().status({
        nodeId: nodeId,
        status: "error",
        message: "Webhook URL is missing",
      }),
      id: `status-error-missing-url-${nodeId}`
    });
    throw new NonRetriableError(`Webhook Response node [${nodeId}] requires a webhookUrl`);
  }

  const responseBody = {
    status: responseStatus,
    message: responseMessage,
    context,
  };

  try {
    // FIX 2: Wrap side-effects (HTTP calls) in step.run for idempotency
    const response = await ky.post(webhookUrl, {
      json: responseBody,
      headers: { "Content-Type": "application/json" },
      throwHttpErrors: false, // Prevents crashing on 404/500 errors
    });

    // Check if it's actually JSON before parsing
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return await response.json();
    }

    // Otherwise, just return the status text or a simple success object
    return { status: response.status, text: await response.text() };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await publish({
      ...webhookChannel().status({
        nodeId: nodeId,
        status: "error",
        message: `Error sending response: ${errorMessage}`,
      }),
      id: `status-error-catch-${nodeId}`
    });

    throw error;
  }
};