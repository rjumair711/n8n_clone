// Support messages: what a customer may send from Support or the workflow
// editor's Help button, and the emails about them. No server-only imports:
// pure rules, tested without a database (src/inngest/__test__/testCoreNodes.ts).
//
// Two ways to reach the platform's owner: email the support address
// (answered from their own inbox), or send a message from inside RXJ
// (answered in the admin dashboard, shown under My messages and emailed).

import z from "zod";
import { LEGAL } from "@/features/marketing/lib/legal-content";

export const SUPPORT_PAGE_HREF = "/support";

export const SUPPORT_TITLE_MAX = 120;
export const SUPPORT_MESSAGE_MAX = 5000;
// Messages one account may send in an hour
export const SUPPORT_MESSAGES_PER_HOUR = 5;

/**
 * The support address customers see: SUPPORT_EMAIL, or the Contact page's
 * address on the hosted app. A self-hosted server shows none unless its
 * owner sets SUPPORT_EMAIL (the Contact page's address is RXJ's own).
 */
export const getSupportEmail = (
  env: Record<string, string | undefined> = process.env,
  selfHosted = env.NEXT_PUBLIC_SELF_HOSTED === "true"
): string | null => {
  const configured = env.SUPPORT_EMAIL?.trim();
  if (configured && z.string().email().safeParse(configured).success) return configured;
  return selfHosted ? null : LEGAL.email;
};

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

export const supportMessageSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Give the message a short title")
    .max(SUPPORT_TITLE_MAX, `The title can be at most ${SUPPORT_TITLE_MAX} characters`),
  message: z
    .string()
    .trim()
    .min(10, "Tell us a little more about what happened")
    .max(SUPPORT_MESSAGE_MAX, `The message can be at most ${SUPPORT_MESSAGE_MAX} characters`),
  name: z.string().trim().min(1, "Your name is needed").max(100),
  email: z.string().trim().email("An email address to reply to is needed").max(254),
  // Where it was sent from; all optional
  workflowId: optionalText(40),
  nodeId: optionalText(100),
  nodeName: optionalText(200),
  nodeType: optionalText(60),
  page: optionalText(300),
});

export type SupportMessageInput = z.infer<typeof supportMessageSchema>;

export const SUPPORT_STATUSES = ["new", "in_progress", "resolved"] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  new: "Sent",
  in_progress: "Being looked at",
  resolved: "Resolved",
};

/** Only a page of this app, never a full address someone typed in. */
export const cleanSupportPage = (page: string | undefined) =>
  page && /^\/[\w\-./]*$/.test(page) ? page : undefined;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// One line, without anything that could add a mail header
const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

/** The email the owner gets about a new message. */
export const buildNewSupportEmail = (input: {
  appUrl: string;
  messageId: string;
  title: string;
  message: string;
  name: string;
  email: string;
  workflowName?: string | null;
  nodeName?: string | null;
  nodeType?: string | null;
}) => {
  const where = [
    input.workflowName ? `Workflow: ${input.workflowName}` : null,
    input.nodeName ? `Node: ${input.nodeName}${input.nodeType ? ` (${input.nodeType})` : ""}` : null,
  ].filter((line): line is string => !!line);
  const url = `${input.appUrl.replace(/\/+$/, "")}/admin/support?message=${encodeURIComponent(input.messageId)}`;

  return {
    subject: `Support: ${oneLine(input.title).slice(0, SUPPORT_TITLE_MAX)}`,
    // Replying to the email answers the customer directly
    replyTo: oneLine(input.email),
    text: [
      `${input.name} <${input.email}> sent a support message.`,
      "",
      `Title: ${input.title}`,
      ...where,
      "",
      input.message,
      "",
      `Open it in RXJ: ${url}`,
    ].join("\n"),
    html: [
      `<p><strong>${escapeHtml(input.name)}</strong> &lt;${escapeHtml(input.email)}&gt; sent a support message.</p>`,
      `<p><strong>${escapeHtml(input.title)}</strong></p>`,
      ...where.map((line) => `<p>${escapeHtml(line)}</p>`),
      `<p style="white-space:pre-wrap">${escapeHtml(input.message)}</p>`,
      `<p><a href="${escapeHtml(url)}">Open it in RXJ</a></p>`,
    ].join(""),
  };
};

export const SUPPORT_REPLY_MAX = 5000;

/** The email a customer gets when an admin answers their message. */
export const buildSupportReplyEmail = (input: {
  appUrl: string;
  title: string;
  reply: string;
  name: string;
}) => {
  const url = `${input.appUrl.replace(/\/+$/, "")}${SUPPORT_PAGE_HREF}`;
  const subject = `Re: ${oneLine(input.title).slice(0, SUPPORT_TITLE_MAX)}`;

  return {
    subject,
    text: [
      `Hi ${oneLine(input.name)},`,
      "",
      input.reply,
      "",
      `You can see your messages and our replies in RXJ: ${url}`,
      "",
      "RXJ support",
    ].join("\n"),
    html: [
      `<p>Hi ${escapeHtml(oneLine(input.name))},</p>`,
      `<p style="white-space:pre-wrap">${escapeHtml(input.reply)}</p>`,
      `<p><a href="${escapeHtml(url)}">See your messages in RXJ</a></p>`,
      "<p>RXJ support</p>",
    ].join(""),
  };
};
