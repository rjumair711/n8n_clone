import ky from "ky";
import { assertPublicUrl } from "@/lib/ssrf";
import type { StepTools, WorkflowContext } from "@/features/executions/types";
import { createInlineStep } from "@/features/executions/lib/inline-step";
import { renderTemplate } from "@/features/executions/lib/templates";
import { emailExecutor } from "@/features/executions/components/email/executor";
import { telegramExecutor } from "@/features/executions/components/telegram/executor";
import { whatsappExecutor } from "@/features/executions/components/whatsapp/executor";
import {
  buildApprovalEmail,
  buildApprovalText,
  isApprovalChannel,
  type ApprovalChannel,
  type ApprovalMessageInput,
} from "@/lib/approvals";

// Where an approval request is sent. The fields accept {{variables}}.
export type ApprovalDelivery = {
  channel?: string;
  // Email: an SMTP credential. Telegram: a bot. WhatsApp: an access token.
  credentialId?: string;
  // Email address, Telegram chat id or WhatsApp number
  recipient?: string;
  // Slack: an incoming webhook URL
  webhookUrl?: string;
  // WhatsApp: the sender's Phone Number ID
  phoneNumberId?: string;
};

export const getApprovalChannel = (delivery: ApprovalDelivery): ApprovalChannel =>
  isApprovalChannel(delivery.channel) ? delivery.channel : "in_app";

const CHANNEL_NAMES: Record<ApprovalChannel, string> = {
  in_app: "the app",
  email: "email",
  slack: "Slack",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
};

/**
 * What is missing from the settings of the chosen channel, or null. Checked
 * before a request is created, so a run does not start waiting for an
 * answer nobody was asked for.
 */
export const getDeliveryProblem = (
  delivery: ApprovalDelivery,
  context: WorkflowContext
): string | null => {
  const channel = getApprovalChannel(delivery);
  const has = (value?: string) => !!renderTemplate(value, context).trim();

  switch (channel) {
    case "in_app":
      return null;
    case "email":
      if (!delivery.credentialId) return "an SMTP credential is required for email";
      return has(delivery.recipient) ? null : "the email address to send to is empty";
    case "slack":
      return has(delivery.webhookUrl) ? null : "the Slack webhook URL is empty";
    case "telegram":
      if (!delivery.credentialId) return "a Telegram bot credential is required";
      return has(delivery.recipient) ? null : "the Telegram chat ID is empty";
    case "whatsapp":
      if (!delivery.credentialId) return "a WhatsApp credential is required";
      if (!has(delivery.phoneNumberId)) return "the WhatsApp Phone Number ID is empty";
      return has(delivery.recipient) ? null : "the WhatsApp number to send to is empty";
  }
};

/**
 * Sends the request through the chosen channel, using the same code as the
 * Email, Telegram and WhatsApp nodes. Call it inside a step. The message is
 * handed to those nodes as a variable, never as a template: the tool's
 * arguments were written by a model and must not be evaluated.
 */
export const sendApprovalNotification = async ({
  delivery,
  message,
  userId,
  nodeId,
  step,
  context,
}: {
  delivery: ApprovalDelivery;
  message: ApprovalMessageInput;
  userId: string;
  nodeId: string;
  step: StepTools;
  context: WorkflowContext;
}): Promise<void> => {
  const channel = getApprovalChannel(delivery);
  if (channel === "in_app") return;

  const text = buildApprovalText(message);
  const recipient = renderTemplate(delivery.recipient, context).trim();

  const base = {
    nodeId,
    userId,
    step: createInlineStep(step),
    allNodes: [],
    connections: [],
  };

  try {
    switch (channel) {
      case "email": {
        const email = buildApprovalEmail(message);

        await emailExecutor({
          ...base,
          data: {
            credentialId: delivery.credentialId,
            recipient: "{{{approvalRecipient}}}",
            subject: "{{{approvalSubject}}}",
            body: "{{{approvalHtml}}}",
          },
          context: {
            approvalRecipient: recipient,
            approvalSubject: email.subject,
            approvalHtml: email.html,
          },
        });
        return;
      }

      case "telegram":
        await telegramExecutor({
          ...base,
          data: {
            variableName: "approvalNotice",
            credentialId: delivery.credentialId,
            chatId: "{{{approvalRecipient}}}",
            text: "{{{approvalText}}}",
            parseMode: "None",
          },
          context: { approvalRecipient: recipient, approvalText: text },
        });
        return;

      case "whatsapp":
        await whatsappExecutor({
          ...base,
          data: {
            variableName: "approvalNotice",
            credentialId: delivery.credentialId,
            operation: "send_text",
            phoneNumberId: "{{{approvalPhoneNumberId}}}",
            to: "{{{approvalRecipient}}}",
            message: "{{{approvalText}}}",
          },
          context: {
            approvalRecipient: recipient,
            approvalPhoneNumberId: renderTemplate(delivery.phoneNumberId, context).trim(),
            approvalText: text,
          },
        });
        return;

      case "slack": {
        const webhookUrl = renderTemplate(delivery.webhookUrl, context).trim();

        // The URL is typed in by the user: never call into a private network
        await assertPublicUrl(webhookUrl);

        await ky.post(webhookUrl, {
          redirect: "error",
          // Slack reads "text"; Discord and Slack-compatible webhooks "content"
          json: /^https:\/\/hooks\.slack\.com\//i.test(webhookUrl)
            ? { text }
            : { text, content: text.slice(0, 2000) },
        });
        return;
      }
    }
  } catch (error) {
    // The executors' own messages can be long; none of them contains the links
    throw new Error(
      `the approval request could not be sent by ${CHANNEL_NAMES[channel]}: ${error instanceof Error ? error.message : "unknown error"}`
    );
  }
};
