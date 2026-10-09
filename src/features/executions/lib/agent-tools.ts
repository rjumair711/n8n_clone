import { z } from "zod";

export type AIParameterType = "string" | "number" | "boolean" | "json";

export type AIParameter = {
  key: string;
  description?: string;
  type: AIParameterType;
};

// {{$fromAI "key" "description" "type"}} (description and type are optional)
const FROM_AI_PATTERN =
  /\{\{\{?\s*\$?fromAI\s+(["'])(.+?)\1(?:\s+(["'])(.*?)\3)?(?:\s+(["'])(.*?)\5)?\s*\}?\}\}/g;

// n8n's call form: {{ $fromAI('key', 'description', 'type') }}
const FROM_AI_CALL_PATTERN =
  /\$fromAI\(\s*(["'])(.+?)\1(?:\s*,\s*(["'])(.*?)\3)?(?:\s*,\s*(["'])(.*?)\5)?/g;

// {{ai.key}}
const AI_PATH_PATTERN = /\{\{\{?[^}]*?\bai\.([A-Za-z_][A-Za-z0-9_]*)/g;

const PARAMETER_TYPES = ["string", "number", "boolean", "json"];

const collectStrings = (value: unknown, into: string[]) => {
  if (typeof value === "string") {
    into.push(value);
  } else if (Array.isArray(value)) {
    for (const entry of value) collectStrings(entry, into);
  } else if (value && typeof value === "object") {
    for (const entry of Object.values(value)) collectStrings(entry, into);
  }
};

/**
 * Finds every field of a tool node that the agent is expected to fill in.
 */
export const extractAIParameters = (nodeData: unknown): AIParameter[] => {
  const strings: string[] = [];
  collectStrings(nodeData, strings);

  const parameters = new Map<string, AIParameter>();

  for (const text of strings) {
    for (const match of [
      ...text.matchAll(FROM_AI_PATTERN),
      ...text.matchAll(FROM_AI_CALL_PATTERN),
    ]) {
      const key = match[2];
      const type = PARAMETER_TYPES.includes(match[6])
        ? (match[6] as AIParameterType)
        : "string";

      parameters.set(key, {
        key,
        description: match[4] || parameters.get(key)?.description,
        type,
      });
    }

    for (const match of text.matchAll(AI_PATH_PATTERN)) {
      if (!parameters.has(match[1])) {
        parameters.set(match[1], { key: match[1], type: "string" });
      }
    }
  }

  return [...parameters.values()];
};

export const buildToolInputSchema = (parameters: AIParameter[]) => {
  // A tool without AI-filled fields still accepts free-form input, which
  // reaches the node as {{ai.query}} / context.ai.query
  if (parameters.length === 0) {
    return z.object({
      query: z
        .string()
        .optional()
        .describe("Optional free-form input for the tool"),
    });
  }

  const shape: Record<string, z.ZodTypeAny> = {};

  for (const parameter of parameters) {
    const base =
      parameter.type === "number"
        ? z.number()
        : parameter.type === "boolean"
          ? z.boolean()
          : parameter.type === "json"
            ? z.record(z.string(), z.any())
            : z.string();

    shape[parameter.key] = parameter.description
      ? base.describe(parameter.description)
      : base;
  }

  return z.object(shape);
};

const TOOL_LABELS: Record<string, string> = {
  HTTP_REQUEST: "HTTP Request",
  CODE: "JavaScript Code",
  CALCULATOR: "Calculator",
  DATE_TIME: "Date & Time",
  TEXT_FORMATTER: "Text Formatter",
  EMAIL_SEND: "Send Email",
  GOOGLE_SHEETS: "Google Sheets",
  GOOGLE_CALENDAR: "Google Calendar",
  NOTION: "Notion",
  TELEGRAM: "Telegram",
  DISCORD: "Discord",
  SLACK: "Slack",
  GITHUB: "GitHub",
  AIRTABLE: "Airtable",
  POSTGRES: "Postgres",
  WHATSAPP: "WhatsApp",
  GMAIL: "Gmail",
  TWILIO: "Twilio",
  JIRA: "Jira",
  HUBSPOT: "HubSpot",
  SALESFORCE: "Salesforce",
  SSH: "SSH Command",
  MYSQL: "MySQL",
  RESEND: "Resend",
  SENDGRID: "SendGrid",
  EDIT_FIELDS: "Edit Fields",
  GOOGLE_DRIVE: "Google Drive",
  PDF_GENERATOR: "PDF Generator",
  CONVERT_TO_FILE: "Convert to File",
  EXTRACT_FROM_FILE: "Extract from File",
  RSS_READ: "RSS Read",
  VECTOR_STORE: "Knowledge Base",
  INFORMATION_EXTRACTOR: "Information Extractor",
  EXECUTE_WORKFLOW: "Call Workflow",
  SPLIT_OUT: "Split Out",
  REMOVE_DUPLICATES: "Remove Duplicates",
};

export const getToolLabel = (nodeType: string) =>
  TOOL_LABELS[nodeType] ||
  nodeType
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

// =========================================================================
// RISK LEVELS
// =========================================================================
// What a node can do when the model decides to call it. The model acts on
// text it has read (a web page, an email, a chat message), and that text may
// try to give it orders, so the tools that can do real damage are off unless
// the workflow's author allows them.
//
//   read       looks something up; changes nothing
//   write      sends a message, or creates or changes a record
//   dangerous  runs commands or raw SQL, deletes, or starts another workflow
export type ToolRisk = "read" | "write" | "dangerous";

export const TOOL_RISK_LABELS: Record<ToolRisk, string> = {
  read: "Read",
  write: "Write",
  dangerous: "Dangerous",
};

// Dangerous whatever they are set up to do
const DANGEROUS_TOOL_TYPES: Record<string, string> = {
  SSH: "it runs commands on a server",
  EXECUTE_WORKFLOW: "it starts another workflow",
};

// Only compute or look things up, inside the workflow or from a fixed source
const READ_TOOL_TYPES = new Set([
  "CALCULATOR",
  "DATE_TIME",
  "TEXT_FORMATTER",
  "CODE",
  "EDIT_FIELDS",
  "SET_VARIABLE",
  "FILTER",
  "IF",
  "SWITCH",
  "MERGE",
  "SPLIT_OUT",
  "AGGREGATE",
  "SORT",
  "LIMIT",
  "REMOVE_DUPLICATES",
  "SUMMARIZE",
  "RSS_READ",
  "EXTRACT_FROM_FILE",
  "CONVERT_TO_FILE",
  "PDF_GENERATOR",
  "INFORMATION_EXTRACTOR",
  "TEXT_CLASSIFIER",
  "OPENAI",
  "ANTHROPIC",
  "GEMINI",
  "DEEPSEEK",
  "KIMI",
  "QWEN",
  "CHAT_MODEL",
]);

const SQL_TOOL_TYPES = new Set(["POSTGRES", "MYSQL"]);

// The operation a node runs when none was saved
const DEFAULT_OPERATIONS: Record<string, string> = {
  MYSQL: "execute_query",
  VECTOR_STORE: "search",
  GOOGLE_DRIVE: "search_files",
  SALESFORCE: "query",
};

const DELETE_OPERATION = /(^|_)(delete|remove|drop|truncate|destroy|purge|trash)(_|$)/i;
const READ_OPERATION =
  /^(get|list|search|find|read|select|query|lookup|fetch|download|retrieve|count)(_|$)/i;

const READ_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * The risk level of a node used as an AI Agent tool, and for dangerous
 * tools the reason, for the error message.
 */
export const describeToolRisk = (
  nodeType: string,
  nodeData: Record<string, unknown> = {}
): { risk: ToolRisk; reason?: string } => {
  if (DANGEROUS_TOOL_TYPES[nodeType]) {
    return { risk: "dangerous", reason: DANGEROUS_TOOL_TYPES[nodeType] };
  }

  const operation = String(
    nodeData.operation || DEFAULT_OPERATIONS[nodeType] || ""
  ).trim();

  if (SQL_TOOL_TYPES.has(nodeType) && (!operation || operation === "execute_query")) {
    return { risk: "dangerous", reason: "it runs raw SQL" };
  }

  if (nodeType === "HTTP_REQUEST") {
    const method = String(nodeData.method || "GET").trim().toUpperCase();

    if (READ_HTTP_METHODS.has(method)) return { risk: "read" };

    // A method the model picks could be DELETE
    return method === "DELETE" || method.includes("{{")
      ? { risk: "dangerous", reason: "it can send DELETE requests" }
      : { risk: "write" };
  }

  if (READ_TOOL_TYPES.has(nodeType)) return { risk: "read" };

  if (DELETE_OPERATION.test(operation)) {
    return { risk: "dangerous", reason: "it deletes data" };
  }

  if (READ_OPERATION.test(operation)) return { risk: "read" };

  // Sending, creating and updating, and anything not known to be harmless
  return { risk: "write" };
};

export const getToolRisk = (
  nodeType: string,
  nodeData: Record<string, unknown> = {}
): ToolRisk => describeToolRisk(nodeType, nodeData).risk;

/**
 * The message for a run that has a dangerous tool connected while "Allow
 * dangerous tools" is off, or null when every tool may be used.
 */
export const getBlockedToolsMessage = (
  tools: { type: string; data?: unknown; name?: string }[],
  allowDangerousTools: boolean | undefined
): string | null => {
  if (allowDangerousTools === true) return null;

  const blocked = tools.flatMap((tool) => {
    const { risk, reason } = describeToolRisk(
      tool.type,
      (tool.data ?? {}) as Record<string, unknown>
    );

    if (risk !== "dangerous") return [];

    const label = getToolLabel(tool.type);
    const name = tool.name?.trim();

    return [
      `${name && name !== label ? `"${name}" (${label})` : `"${label}"`}: ${reason}`,
    ];
  });

  if (blocked.length === 0) return null;

  const one = blocked.length === 1;

  return `AI Agent: dangerous tool${one ? "" : "s"} connected (${blocked.join("; ")}). The model decides when to call a tool, and text it reads can try to trick it. Turn on "Allow dangerous tools" in the AI Agent's settings to let it use ${one ? "this tool" : "these tools"}, or disconnect ${one ? "it" : "them"}.`;
};

// Providers only accept [a-zA-Z0-9_-]{1,64} as a tool name
export const sanitizeToolName = (name: string) =>
  name
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);

export const getDefaultToolName = (nodeType: string) =>
  sanitizeToolName(getToolLabel(nodeType).toLowerCase());

export const getDefaultToolDescription = (
  nodeType: string,
  nodeData: Record<string, unknown>
) => {
  const label = getToolLabel(nodeType);

  if (nodeType === "HTTP_REQUEST" && nodeData.endpoint) {
    return `Makes an HTTP ${nodeData.method || "GET"} request to ${nodeData.endpoint}`;
  }

  if (nodeData.operation) {
    return `Runs the ${label} "${nodeData.operation}" operation`;
  }

  return `Runs the ${label} node`;
};

/**
 * Tool names must be unique within one agent.
 */
export const uniqueToolName = (name: string, taken: Set<string>) => {
  let candidate = name || "tool";
  let suffix = 2;

  while (taken.has(candidate)) {
    candidate = `${name}_${suffix++}`.slice(0, 64);
  }

  taken.add(candidate);
  return candidate;
};
