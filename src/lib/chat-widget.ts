// The public website chat of a Chat Trigger: its settings, who may embed
// it, and what a visitor is shown. Nothing here touches the database, and
// there are no server-only imports: the editor uses it too.
//
//   <script src="<app>/widget.js" data-id="<chat trigger node id>" async></script>
//   <app>/chat/<id>     the hosted chat page (also what the widget frames)

export const DEFAULT_CHAT_COLOR = "#2563eb";
export const DEFAULT_CHAT_TITLE = "Chat with us";
export const DEFAULT_HANDOFF_LABEL = "Talk to a human";

export const MAX_CHAT_MESSAGE_LENGTH = 4000;
// What a visitor is told when they write after asking for a person
export const CHAT_PAUSED_REPLY =
  "This conversation was passed to a person. They will get back to you.";
// How much of a conversation a visitor's page loads, and a person is sent
export const CHAT_HISTORY_LIMIT = 50;
// Stored conversations of the widget are removed after this many days
export const CHAT_TRANSCRIPT_RETENTION_DAYS = 30;

export const HANDOFF_CHANNELS = [
  { value: "email", label: "Email" },
  { value: "slack", label: "Slack" },
  { value: "whatsapp", label: "WhatsApp" },
] as const;

export type HandoffChannel = (typeof HANDOFF_CHANNELS)[number]["value"];

export const CHAT_DIRECTIONS = [
  { value: "auto", label: "Automatic (from the text)" },
  { value: "ltr", label: "Left to right" },
  { value: "rtl", label: "Right to left (Urdu, Arabic)" },
] as const;

export type ChatDirection = "ltr" | "rtl";

export type ChatWidgetSettings = {
  public: boolean;
  title: string;
  color: string;
  welcomeMessage: string;
  avatarUrl: string;
  direction: ChatDirection;
  // Hosts that may show the widget; empty means any site
  allowedDomains: string[];
  handoff: {
    enabled: boolean;
    label: string;
    channel: HandoffChannel;
    credentialId: string;
    recipient: string;
    webhookUrl: string;
    phoneNumberId: string;
  };
};

// What the visitor's browser is given: nothing about the handoff channel
export type PublicChatConfig = {
  id: string;
  title: string;
  color: string;
  welcomeMessage: string;
  avatarUrl: string;
  direction: ChatDirection;
  handoffLabel: string | null;
};

const text = (value: unknown, limit: number) =>
  String(value ?? "").trim().slice(0, limit);

const isOn = (value: unknown) => value === true || value === "true";

export const normalizeChatColor = (value: unknown): string => {
  const color = text(value, 9);

  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : DEFAULT_CHAT_COLOR;
};

const normalizeAvatarUrl = (value: unknown): string => {
  const url = text(value, 500);

  // Shown in an <img>: only a web address, never a javascript: or data: URL
  return /^https:\/\/[^\s"'<>]+$/i.test(url) ? url : "";
};

// Hebrew, Arabic (Urdu, Persian), Syriac, Thaana and their presentation forms
const RTL_CHARACTERS = /[֐-ࣿיִ-﷿ﹰ-﻿]/;

/**
 * The direction of a text from its first strong character: Urdu and Arabic
 * read right to left.
 */
export const detectDirection = (value: string): ChatDirection => {
  for (const character of value) {
    if (RTL_CHARACTERS.test(character)) return "rtl";
    if (/\p{L}/u.test(character)) return "ltr";
  }

  return "ltr";
};

/**
 * "example.com, https://Shop.Example.com/path\n*.example.org" as a clean
 * list of hosts: lower case, without scheme, path or port. An entry that
 * starts with "*." also covers every subdomain.
 */
export const parseAllowedDomains = (value: unknown): string[] => {
  const entries = Array.isArray(value)
    ? value.map(String)
    : String(value ?? "").split(/[\s,]+/);

  const hosts = new Set<string>();

  for (const entry of entries) {
    const host = entry
      .trim()
      .toLowerCase()
      .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
      .replace(/[/?#].*$/, "")
      .replace(/:\d+$/, "");

    if (/^(\*\.)?([a-z0-9-]+\.)*[a-z0-9-]+$/.test(host) && host.length <= 253) {
      hosts.add(host);
    }
  }

  return [...hosts].slice(0, 50);
};

/**
 * Whether a site may show the widget. An empty list allows every site.
 * `origin` is the page's origin ("https://shop.example.com") or host.
 */
export const isDomainAllowed = (
  origin: string | null | undefined,
  allowedDomains: readonly string[]
): boolean => {
  if (allowedDomains.length === 0) return true;
  if (!origin) return false;

  let host: string;
  try {
    host = new URL(origin.includes("://") ? origin : `https://${origin}`).hostname.toLowerCase();
  } catch {
    return false;
  }

  return allowedDomains.some((allowed) =>
    allowed.startsWith("*.")
      ? host === allowed.slice(2) || host.endsWith(allowed.slice(1))
      : host === allowed
  );
};

/**
 * The frame-ancestors value for the chat page: the app itself and the
 * allowed sites, or any site when the list is empty. This is what stops
 * another site from showing the chat in a frame.
 */
export const buildFrameAncestors = (allowedDomains: readonly string[]): string => {
  if (allowedDomains.length === 0) return "frame-ancestors *";

  const sources = allowedDomains
    // "*.example.org" also means example.org itself
    .flatMap((host) => (host.startsWith("*.") ? [host, host.slice(2)] : [host]))
    // Any port: a source without one only matches 80 and 443, and a site
    // that is served on another port is still that site
    .flatMap((host) => [`https://${host}:*`, `http://${host}:*`]);

  return `frame-ancestors 'self' ${sources.join(" ")}`;
};

/**
 * A Chat Trigger node's data as the widget's settings.
 */
export const parseChatWidgetSettings = (
  data: Record<string, unknown> | null | undefined
): ChatWidgetSettings => {
  const source = data ?? {};
  const title = text(source.chatTitle, 80) || DEFAULT_CHAT_TITLE;
  const welcomeMessage = text(source.chatWelcome, 1000);
  const channel = HANDOFF_CHANNELS.some((entry) => entry.value === source.handoffChannel)
    ? (source.handoffChannel as HandoffChannel)
    : "email";

  return {
    public: isOn(source.chatPublic),
    title,
    color: normalizeChatColor(source.chatColor),
    welcomeMessage,
    avatarUrl: normalizeAvatarUrl(source.chatAvatarUrl),
    direction:
      source.chatDirection === "rtl" || source.chatDirection === "ltr"
        ? source.chatDirection
        : detectDirection(`${title} ${welcomeMessage}`),
    allowedDomains: parseAllowedDomains(source.chatAllowedDomains),
    handoff: {
      enabled: isOn(source.handoffEnabled),
      label: text(source.handoffLabel, 40) || DEFAULT_HANDOFF_LABEL,
      channel,
      credentialId: text(source.handoffCredentialId, 100),
      recipient: text(source.handoffRecipient, 320),
      webhookUrl: text(source.handoffWebhookUrl, 2000),
      phoneNumberId: text(source.handoffPhoneNumberId, 40),
    },
  };
};

export const toPublicChatConfig = (
  id: string,
  settings: ChatWidgetSettings
): PublicChatConfig => ({
  id,
  title: settings.title,
  color: settings.color,
  welcomeMessage: settings.welcomeMessage,
  avatarUrl: settings.avatarUrl,
  direction: settings.direction,
  handoffLabel: settings.handoff.enabled ? settings.handoff.label : null,
});

export const buildEmbedSnippet = (appUrl: string, id: string) =>
  `<script src="${appUrl}/widget.js" data-id="${id}" async></script>`;

export const buildChatPageUrl = (appUrl: string, id: string) =>
  `${appUrl}/chat/${encodeURIComponent(id)}`;

// Made in the visitor's browser and kept there
const SESSION_ID = /^[A-Za-z0-9_-]{16,64}$/;

export const isValidChatSessionId = (value: unknown): value is string =>
  typeof value === "string" && SESSION_ID.test(value);

/**
 * The conversation's key: the {{sessionId}} the workflow sees (so Buffer
 * Memory keeps one history per visitor of one widget) and what its stored
 * transcript is filed under. It cannot collide with a session of the
 * editor's chat panel or of another widget.
 */
export const toChatSessionKey = (widgetId: string, sessionId: string) =>
  `widget:${widgetId}:${sessionId}`;

/**
 * What a visitor is shown of a finished run: the agent's answer, and only
 * that. The rest of the workflow's data is never sent to the browser.
 */
export const readPublicReply = (output: unknown): string | null => {
  if (!output || typeof output !== "object") return null;

  const reply = (output as Record<string, unknown>).output;

  if (typeof reply === "string") return reply.trim() || null;

  // A Structured Output Parser's answer is data: shown as it is
  return reply && typeof reply === "object" ? JSON.stringify(reply, null, 2) : null;
};

export type TranscriptEntry = {
  role: string;
  content: string;
  createdAt: Date;
};

const speaker = (role: string) => (role === "user" ? "Visitor" : "Bot");

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * The conversation a visitor asked a person to take over, as plain text
 * (Slack, WhatsApp) and as an email. Everything the visitor or the model
 * wrote is escaped in the email: it is shown, never interpreted.
 */
export const buildHandoffMessage = ({
  title,
  workflowName,
  contact,
  transcript,
}: {
  title: string;
  workflowName: string;
  contact: string;
  transcript: TranscriptEntry[];
}): { text: string; subject: string; html: string } => {
  const lines = transcript.map(
    (entry) => `${speaker(entry.role)}: ${entry.content.slice(0, 1500)}`
  );

  const heading = `A visitor of "${title}" asked to talk to a human`;
  const reach = contact ? `How to reach them: ${contact}` : "They left no contact details.";

  return {
    subject: `Chat handoff: ${title}`,
    text: [
      heading,
      `Workflow: ${workflowName}`,
      reach,
      `Conversation:\n${lines.join("\n") || "(no messages yet)"}`,
      "The bot no longer answers in this conversation.",
    ].join("\n\n"),
    html: [
      `<div style="font-family:system-ui,Arial,sans-serif;font-size:14px;color:#111827;max-width:600px">`,
      `<p style="font-size:16px;font-weight:600">${escapeHtml(heading)}</p>`,
      `<p>Workflow: ${escapeHtml(workflowName)}</p>`,
      `<p>${escapeHtml(reach)}</p>`,
      `<pre style="background:#f3f4f6;padding:12px;border-radius:6px;white-space:pre-wrap;word-break:break-word;font-size:13px">${escapeHtml(lines.join("\n") || "(no messages yet)")}</pre>`,
      `<p style="color:#6b7280;font-size:12px">The bot no longer answers in this conversation.</p>`,
      `</div>`,
    ].join(""),
  };
};
