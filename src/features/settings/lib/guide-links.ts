import type { NodeType } from "@prisma/client";
import { SELF_HOSTED } from "@/config/self-hosted";

// Links from the rest of the app into Settings → Help → Platform guide:
// one per node type (the node toolbar's guide button) and one per known
// error (the execution page). A link names a topic of guide-content.ts;
// the guide opens its chapter and scrolls to it. The tests check that
// every topic named here exists.

export const GUIDE_PATH = "/settings/guide";

/** The guide, at a topic. */
export const guideTopicHref = (topicId: string) => `${GUIDE_PATH}#guide-topic-${topicId}`;

// Every node type but the canvas-only ones, so a new node type fails the
// type check until it is given a topic here
type GuideNodeType = Exclude<NodeType, "INITIAL" | "STICKY_NOTE">;

const NODE_TOPICS: Record<GuideNodeType, string> = {
  // Triggers
  MANUAL_TRIGGER: "trigger-list",
  SCHEDULE_TRIGGER: "trigger-list",
  WEBHOOK_TRIGGER: "trigger-list",
  STRIPE_TRIGGER: "public-address",
  GOOGLE_FORM_TRIGGER: "trigger-list",
  TYPEFORM_TRIGGER: "public-address",
  GMAIL_TRIGGER: "trigger-list",
  RSS_FEED_TRIGGER: "trigger-list",
  TELEGRAM_TRIGGER: "public-address",
  WHATSAPP_TRIGGER: "public-address",
  MESSENGER_TRIGGER: "public-address",
  INSTAGRAM_TRIGGER: "public-address",
  SHOPIFY_TRIGGER: "public-address",
  WOOCOMMERCE_TRIGGER: "public-address",
  CHAT_TRIGGER: "widget",
  FORM_TRIGGER: "form-trigger",
  FORM: "multi-step",
  MCP_SERVER_TRIGGER: "mcp-server",
  ERROR_TRIGGER: "errors",
  EXECUTE_WORKFLOW_TRIGGER: "routing",
  // Models and AI
  OPENAI: "models",
  ANTHROPIC: "models",
  GEMINI: "models",
  DEEPSEEK: "models",
  KIMI: "models",
  QWEN: "models",
  CHAT_MODEL: "models",
  MODEL_ROUTER: "reliability",
  AI_AGENT: "agent",
  AI_AGENT_TOOL: "agent",
  THINK_TOOL: "agent",
  STRUCTURED_OUTPUT_PARSER: "agent",
  BUFFER_MEMORY: "memory",
  POSTGRES_MEMORY: "memory",
  GUARDRAILS: "agent-safety",
  VECTOR_STORE: "documents",
  DOCUMENT_LOADER: "documents",
  TEXT_CLASSIFIER: "ai-nodes",
  INFORMATION_EXTRACTOR: "ai-nodes",
  ANALYZE_DOCUMENT: "ai-nodes",
  TRANSCRIBE_AUDIO: "ai-nodes",
  TEXT_TO_SPEECH: "ai-nodes",
  IMAGE_GENERATION: "ai-nodes",
  WEB_SEARCH: "ai-nodes",
  READ_WEB_PAGE: "ai-nodes",
  BROWSER: "ai-nodes",
  MCP_CLIENT_TOOL: "ai-nodes",
  // Flow
  IF: "routing",
  SWITCH: "routing",
  FILTER: "routing",
  MERGE: "routing",
  LOOP: "routing",
  EXECUTE_WORKFLOW: "routing",
  WAIT: "wait",
  DELAY: "wait",
  APPROVAL: "approvals",
  STOP_AND_ERROR: "errors",
  WEBHOOK_RESPONSE: "trigger-list",
  RESPOND_TO_WEBHOOK: "trigger-list",
  // Data
  SET_VARIABLE: "transform",
  EDIT_FIELDS: "transform",
  CODE: "transform",
  DATE_TIME: "transform",
  TEXT_FORMATTER: "transform",
  CALCULATOR: "transform",
  SPLIT_OUT: "items",
  AGGREGATE: "items",
  SORT: "items",
  LIMIT: "items",
  REMOVE_DUPLICATES: "items",
  SUMMARIZE: "items",
  RSS_READ: "items",
  DATA_TABLE: "data-table",
  PDF_GENERATOR: "files",
  CONVERT_TO_FILE: "files",
  EXTRACT_FROM_FILE: "files",
  // Apps
  HTTP_REQUEST: "apps",
  GOOGLE_SHEETS: "apps",
  GOOGLE_CALENDAR: "apps",
  GOOGLE_DRIVE: "apps",
  NOTION: "apps",
  GITHUB: "apps",
  AIRTABLE: "apps",
  JIRA: "apps",
  HUBSPOT: "apps",
  SALESFORCE: "apps",
  SHOPIFY: "apps",
  WOOCOMMERCE: "apps",
  POSTGRES: "apps",
  MYSQL: "apps",
  WORDPRESS: "apps",
  GOOGLE_SEARCH_CONSOLE: "apps",
  LINKEDIN: "messaging",
  S3_STORAGE: "files",
  SSH: SELF_HOSTED ? "ssh" : "ssh-hosted",
  // Messaging
  WHATSAPP: "messaging",
  TELEGRAM: "messaging",
  MESSENGER: "messaging",
  INSTAGRAM: "messaging",
  SOCIAL_POST: "messaging",
  GMAIL: "messaging",
  EMAIL_SEND: "messaging",
  RESEND: "messaging",
  SENDGRID: "messaging",
  SLACK: "messaging",
  DISCORD: "messaging",
  TWILIO: "messaging",
};

/** The guide topic about a node type, or null for one it does not cover. */
export const guideTopicForNode = (type: string | undefined): string | null =>
  (type && (NODE_TOPICS as Record<string, string>)[type]) || null;

export const NODE_GUIDE_TOPICS: Readonly<Record<string, string>> = NODE_TOPICS;

// Known errors, first match wins; anything else goes to the common problems
const ERROR_TOPICS: [RegExp, string][] = [
  [/Monthly AI budget reached/i, "ai-cost"],
  [/RXJ AI \(included\) credits/i, SELF_HOSTED ? "common-problems" : "rxj-ai"],
  [/Daily [\w ]+ limit reached/i, SELF_HOSTED ? "common-problems" : "message-caps"],
  [/dangerous tool/i, "agent-safety"],
  [/rejected this action|approval/i, "approvals"],
  [/24[- ]hour|re-engagement|outside the allowed window/i, "messaging"],
];

/** The guide topic that helps with a run's error. */
export const guideTopicForError = (message: string | null | undefined): string => {
  const text = message ?? "";
  return ERROR_TOPICS.find(([pattern]) => pattern.test(text))?.[1] ?? "common-problems";
};
