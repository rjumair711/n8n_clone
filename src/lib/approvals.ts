// Approval requests: what the AI Agent's "Require approval" tools and the
// Send and Wait for Approval node share. Nothing here touches the database
// or Inngest, and there are no server-only imports: the editor uses it too.
// The signed Approve / Reject links are in ./approval-links.ts.

// Sent when a request was answered; the waiting run listens for it
export const APPROVAL_DECIDED_EVENT = "workflows/approval.decided";

// Execution.waitingFor
export const WAITING_FOR_APPROVAL = "approval";

export const APPROVAL_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
} as const;

export type ApprovalDecision = "approve" | "reject";

export const isApprovalDecision = (value: unknown): value is ApprovalDecision =>
  value === "approve" || value === "reject";

export const APPROVAL_CHANNELS = [
  { value: "in_app", label: "In the app (Approvals page)" },
  { value: "email", label: "Email" },
  { value: "slack", label: "Slack" },
  { value: "telegram", label: "Telegram" },
  { value: "whatsapp", label: "WhatsApp" },
] as const;

export type ApprovalChannel = (typeof APPROVAL_CHANNELS)[number]["value"];

export const isApprovalChannel = (value: unknown): value is ApprovalChannel =>
  APPROVAL_CHANNELS.some((channel) => channel.value === value);

// What the agent is told when its tool call was not approved
export const TOOL_REJECTED_MESSAGE = "The user rejected this action";
export const TOOL_EXPIRED_MESSAGE =
  "Nobody approved this action before the approval request expired, so it was not run";

export const APPROVAL_DEFAULT_TIMEOUT_AMOUNT = "24";
export const APPROVAL_DEFAULT_TIMEOUT_UNIT = "hours";

/**
 * Whether a tool call waits for a person. What was saved for the tool wins.
 * Without a saved choice, tools that write or are dangerous need approval,
 * but only on agents made since approvals exist (`defaultByRisk`): an agent
 * that was already running keeps running as it did.
 */
export const toolRequiresApproval = ({
  saved,
  risk,
  defaultByRisk,
}: {
  saved: boolean | undefined;
  risk: "read" | "write" | "dangerous";
  defaultByRisk: boolean;
}): boolean => {
  if (typeof saved === "boolean") return saved;

  return defaultByRisk && risk !== "read";
};

// Agent data: set on AI Agent nodes added to the canvas since approvals exist
export const TOOL_APPROVAL_DEFAULT_BY_RISK = "risk";

const MAX_DETAIL_CHARS = 4000;
const MAX_TITLE_CHARS = 200;

export const clipApprovalTitle = (title: string) => {
  const text = title.replace(/\s+/g, " ").trim() || "Approval";

  return text.length > MAX_TITLE_CHARS ? `${text.slice(0, MAX_TITLE_CHARS)}...` : text;
};

/**
 * The tool's arguments (or any other details) as text a person can read,
 * cut to a size that fits a chat message.
 */
export const formatApprovalDetails = (details: unknown): string => {
  if (details === undefined || details === null) return "";

  const text =
    typeof details === "string" ? details : JSON.stringify(details, null, 2);

  return text.length > MAX_DETAIL_CHARS
    ? `${text.slice(0, MAX_DETAIL_CHARS)}... [cut]`
    : text;
};

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export type ApprovalMessageInput = {
  kind: "tool" | "node";
  title: string;
  details: unknown;
  workflowName: string;
  approveUrl: string;
  rejectUrl: string;
  expiresAt: Date;
};

const describe = (input: ApprovalMessageInput) =>
  input.kind === "tool"
    ? {
        heading: `An AI Agent wants to use the tool "${input.title}"`,
        detailsLabel: "Arguments",
      }
    : { heading: input.title, detailsLabel: "Details" };

/**
 * The approval request as plain text, for Slack, Telegram and WhatsApp.
 */
export const buildApprovalText = (input: ApprovalMessageInput): string => {
  const { heading, detailsLabel } = describe(input);
  const details = formatApprovalDetails(input.details);

  return [
    `Approval needed: ${heading}`,
    `Workflow: ${input.workflowName}`,
    details ? `${detailsLabel}:\n${details}` : "",
    `Approve: ${input.approveUrl}`,
    `Reject: ${input.rejectUrl}`,
    `Each link opens a page that asks you to confirm. The request can be answered once and expires on ${input.expiresAt.toISOString()}.`,
  ]
    .filter(Boolean)
    .join("\n\n");
};

/**
 * The same as an email. Everything that comes from the workflow or the
 * model is escaped: it is shown, never interpreted.
 */
export const buildApprovalEmail = (
  input: ApprovalMessageInput
): { subject: string; html: string } => {
  const { heading, detailsLabel } = describe(input);
  const details = formatApprovalDetails(input.details);
  const button =
    "display:inline-block;padding:10px 18px;border-radius:6px;color:#ffffff;text-decoration:none;font-weight:600;";

  return {
    subject: `Approval needed: ${clipApprovalTitle(input.title)}`,
    html: [
      `<div style="font-family:system-ui,Arial,sans-serif;font-size:14px;color:#111827;max-width:560px">`,
      `<p style="font-size:16px;font-weight:600">${escapeHtml(heading)}</p>`,
      `<p>Workflow: ${escapeHtml(input.workflowName)}</p>`,
      details
        ? `<p style="margin-bottom:4px">${detailsLabel}:</p><pre style="background:#f3f4f6;padding:12px;border-radius:6px;white-space:pre-wrap;word-break:break-word;font-size:12px">${escapeHtml(details)}</pre>`
        : "",
      `<p><a href="${escapeHtml(input.approveUrl)}" style="${button}background:#16a34a">Approve</a>&nbsp;&nbsp;<a href="${escapeHtml(input.rejectUrl)}" style="${button}background:#dc2626">Reject</a></p>`,
      `<p style="color:#6b7280;font-size:12px">Each button opens a page that asks you to confirm. The request can be answered once and expires on ${escapeHtml(input.expiresAt.toISOString())}.</p>`,
      `</div>`,
    ].join(""),
  };
};
