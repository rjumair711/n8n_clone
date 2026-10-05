import type { NodeExecutor } from "@/features/executions/types";
import { NonRetriableError } from "inngest";
import { google, type gmail_v1 } from "googleapis";
import prisma from "@/lib/db";
import { getGoogleAuthFromCredential } from "@/lib/google-oauth";
import { loadWorkflowFile } from "@/lib/workflow-files";
import { renderTemplate } from "../../lib/templates";
import { resolveFileId } from "../files/executors";

type GmailData = {
  variableName?: string;
  credentialId?: string;
  operation?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  message?: string;
  // "text" | "html"
  emailType?: string;
  query?: string;
  limit?: string;
  messageId?: string;
  // Comma-separated file variables, e.g. "pdf.file, report.file"
  attachments?: string;
};

type EmailAttachment = { fileName: string; mimeType: string; data: Buffer };

// Mail lines may not be longer than 998 characters; 76 is the custom
const wrapBase64 = (data: Buffer) =>
  data.toString("base64").replace(/(.{76})/g, "$1\r\n").trimEnd();

// Header values must stay on one line, or a variable could add headers
const headerValue = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

const encodeHeaderText = (value: string) =>
  /^[\x20-\x7e]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;

const buildRawEmail = (fields: {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  html: boolean;
  inReplyTo?: string;
  references?: string;
  attachments?: EmailAttachment[];
}) => {
  const attachments = fields.attachments ?? [];
  const boundary = `rxj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

  const bodyPart = [
    `Content-Type: ${fields.html ? "text/html" : "text/plain"}; charset=UTF-8`,
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(Buffer.from(fields.body, "utf8")),
  ];

  const lines = [
    `To: ${headerValue(fields.to)}`,
    ...(fields.cc ? [`Cc: ${headerValue(fields.cc)}`] : []),
    ...(fields.bcc ? [`Bcc: ${headerValue(fields.bcc)}`] : []),
    `Subject: ${encodeHeaderText(headerValue(fields.subject))}`,
    ...(fields.inReplyTo ? [`In-Reply-To: ${headerValue(fields.inReplyTo)}`] : []),
    ...(fields.references ? [`References: ${headerValue(fields.references)}`] : []),
    "MIME-Version: 1.0",
    ...(attachments.length === 0
      ? bodyPart
      : [
          `Content-Type: multipart/mixed; boundary="${boundary}"`,
          "",
          `--${boundary}`,
          ...bodyPart,
          ...attachments.flatMap((attachment) => {
            const name = encodeHeaderText(
              headerValue(attachment.fileName).replace(/"/g, "'")
            );

            return [
              `--${boundary}`,
              `Content-Type: ${headerValue(attachment.mimeType)}; name="${name}"`,
              `Content-Disposition: attachment; filename="${name}"`,
              "Content-Transfer-Encoding: base64",
              "",
              wrapBase64(attachment.data),
            ];
          }),
          `--${boundary}--`,
        ]),
  ];

  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
};

const getHeader = (message: gmail_v1.Schema$Message, name: string) =>
  message.payload?.headers?.find(
    (header) => header.name?.toLowerCase() === name.toLowerCase()
  )?.value ?? "";

const decodeBody = (data?: string | null) =>
  data ? Buffer.from(data, "base64url").toString("utf8") : "";

// The readable body: the first text/plain part, else the first text/html part
const findBody = (
  part: gmail_v1.Schema$MessagePart | undefined,
  mimeType: string
): string => {
  if (!part) return "";

  if (part.mimeType === mimeType && part.body?.data) {
    return decodeBody(part.body.data);
  }

  for (const child of part.parts ?? []) {
    const found = findBody(child, mimeType);
    if (found) return found;
  }

  return "";
};

export const summarizeMessage = (message: gmail_v1.Schema$Message) => ({
  id: message.id,
  threadId: message.threadId,
  from: getHeader(message, "From"),
  to: getHeader(message, "To"),
  subject: getHeader(message, "Subject"),
  date: getHeader(message, "Date"),
  snippet: message.snippet,
  labelIds: message.labelIds ?? [],
  text:
    findBody(message.payload, "text/plain") ||
    findBody(message.payload, "text/html"),
});

const toGmailError = (error: any) => {
  if (error instanceof NonRetriableError) return error;

  const detail =
    error?.response?.data?.error?.message ||
    error?.response?.data?.error_description ||
    error?.message ||
    "Unknown error";

  // The refresh token was revoked or expired. Errors that crossed a step
  // boundary only keep their message.
  if (
    error?.response?.data?.error === "invalid_grant" ||
    /invalid_grant/.test(String(error?.message))
  ) {
    return new NonRetriableError(
      "Gmail node: Google access was revoked or expired. Connect the Google account again under Credentials."
    );
  }

  return new NonRetriableError(`Gmail API error: ${detail}`);
};

export const gmailExecutor: NodeExecutor<GmailData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
}) => {
  if (!data.variableName) {
    throw new NonRetriableError("Gmail node: Variable name is missing");
  }
  if (!data.operation) {
    throw new NonRetriableError("Gmail node: Operation is required");
  }
  if (!data.credentialId) {
    throw new NonRetriableError("Gmail node: Credential is required");
  }

  // Only the encrypted row passes through the step
  const credential = await step.run(`gmail-${nodeId}-get-credential`, async () => {
    return prisma.credential.findUnique({
      where: { id: data.credentialId, userId },
    });
  });

  if (!credential) {
    throw new NonRetriableError("Gmail node: Credential not found");
  }

  // Resolved before any step runs, so a wrong variable fails early
  const attachmentIds =
    data.operation === "send_email"
      ? (data.attachments || "")
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean)
          .map((entry) => resolveFileId("Gmail", context, entry))
      : [];

  const requireField = (value: string | undefined, name: string) => {
    const rendered = renderTemplate(value, context).trim();
    if (!rendered) {
      throw new NonRetriableError(`Gmail node: ${name} is required`);
    }
    return rendered;
  };

  try {
    const result = await step.run(
      `gmail-${nodeId}-${data.operation}`,
      async () => {
        const gmail = google.gmail({
          version: "v1",
          auth: getGoogleAuthFromCredential("Gmail", credential.value),
        });

        switch (data.operation) {
          case "send_email": {
            const attachments: EmailAttachment[] = [];
            for (const fileId of attachmentIds) {
              const file = await loadWorkflowFile("Gmail", fileId, userId);

              attachments.push({
                fileName: file.reference.fileName,
                mimeType: file.reference.mimeType,
                data: file.data,
              });
            }

            const sent = await gmail.users.messages.send({
              userId: "me",
              requestBody: {
                raw: buildRawEmail({
                  to: requireField(data.to, "To"),
                  cc: renderTemplate(data.cc, context).trim(),
                  bcc: renderTemplate(data.bcc, context).trim(),
                  subject: requireField(data.subject, "Subject"),
                  body: renderTemplate(data.message, context),
                  html: data.emailType === "html",
                  attachments,
                }),
              },
            });

            return {
              id: sent.data.id,
              threadId: sent.data.threadId,
              labelIds: sent.data.labelIds ?? [],
              attachments: attachments.map((attachment) => attachment.fileName),
            };
          }

          case "reply": {
            const messageId = requireField(data.messageId, "Message ID");

            const original = await gmail.users.messages.get({
              userId: "me",
              id: messageId,
              format: "metadata",
              metadataHeaders: ["From", "Reply-To", "Subject", "Message-ID", "References"],
            });

            const subject = getHeader(original.data, "Subject");
            const originalId = getHeader(original.data, "Message-ID");

            const sent = await gmail.users.messages.send({
              userId: "me",
              requestBody: {
                threadId: original.data.threadId,
                raw: buildRawEmail({
                  to:
                    getHeader(original.data, "Reply-To") ||
                    getHeader(original.data, "From"),
                  subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`,
                  body: renderTemplate(data.message, context),
                  html: data.emailType === "html",
                  inReplyTo: originalId,
                  references: `${getHeader(original.data, "References")} ${originalId}`.trim(),
                }),
              },
            });

            return { id: sent.data.id, threadId: sent.data.threadId };
          }

          case "search_messages": {
            const limit = Math.min(
              Math.max(Number(renderTemplate(data.limit, context)) || 10, 1),
              50
            );

            const list = await gmail.users.messages.list({
              userId: "me",
              q: renderTemplate(data.query, context).trim() || undefined,
              maxResults: limit,
            });

            const messages = await Promise.all(
              (list.data.messages ?? []).map(async (entry) => {
                const message = await gmail.users.messages.get({
                  userId: "me",
                  id: entry.id!,
                  format: "full",
                });

                return summarizeMessage(message.data);
              })
            );

            return { messages, count: messages.length };
          }

          case "get_message": {
            const message = await gmail.users.messages.get({
              userId: "me",
              id: requireField(data.messageId, "Message ID"),
              format: "full",
            });

            return summarizeMessage(message.data);
          }

          case "mark_as_read": {
            const message = await gmail.users.messages.modify({
              userId: "me",
              id: requireField(data.messageId, "Message ID"),
              requestBody: { removeLabelIds: ["UNREAD"] },
            });

            return { id: message.data.id, labelIds: message.data.labelIds ?? [] };
          }

          default:
            throw new NonRetriableError(
              `Gmail node: Unsupported operation "${data.operation}"`
            );
        }
      }
    );

    return {
      ...context,
      [data.variableName]: result,
    };
  } catch (error: any) {
    throw toGmailError(error);
  }
};
