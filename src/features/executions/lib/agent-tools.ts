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
    for (const match of text.matchAll(FROM_AI_PATTERN)) {
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
};

export const getToolLabel = (nodeType: string) =>
  TOOL_LABELS[nodeType] ||
  nodeType
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

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
