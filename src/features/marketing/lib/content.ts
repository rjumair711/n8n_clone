import { NodeType } from "@prisma/client";
import {
  BotIcon,
  CodeIcon,
  FileSearchIcon,
  KeyRoundIcon,
  LockKeyholeIcon,
  type LucideIcon,
  MessageSquareIcon,
  RouteIcon,
  ScrollTextIcon,
  ShieldAlertIcon,
  SparklesIcon,
  UserCheckIcon,
  UsersIcon,
} from "lucide-react";
import { PLAN_AI_CREDITS } from "@/config/ai-credits";
import { getNodeLabel } from "@/config/node-labels";
import { PLAN_LIMITS } from "@/config/plans";

// The words of the landing page. Everything here describes something the
// app does today (see README.md); numbers come from the code, not from
// this file. Change a claim only together with the feature.

/** How many node types the editor has, counted from the schema's NodeType. */
export const NODE_COUNT = Object.values(NodeType).filter(
  (type) => type !== NodeType.INITIAL,
).length;

const labels = (...types: NodeType[]) =>
  types.map((type) => getNodeLabel(type));

const number = (value: number) => value.toLocaleString("en-US");

export type Feature = {
  key: string;
  icon: LucideIcon;
  title: string;
  text: string;
  points: string[];
};

export const FEATURES: Feature[] = [
  {
    key: "agents",
    icon: BotIcon,
    title: "AI agents with tools, memory and other agents",
    text: "Connect any node to an agent's Tools port and it becomes a tool the model can call. Agents remember each contact, and can hand a task to another agent.",
    points: [
      "Any node as a tool",
      "Memory per contact",
      "Agent-to-agent tasks",
      "MCP client and server",
    ],
  },
  {
    key: "approval",
    icon: UserCheckIcon,
    title: "Human approval before risky actions",
    text: "Tools that write or delete wait for a person. Approve or reject in the app, by email, Slack, Telegram or WhatsApp.",
    points: ["Read · Write · Dangerous", "Signed, expiring links"],
  },
  {
    key: "models",
    icon: RouteIcon,
    title: "Any model, any budget",
    text: "OpenAI, Claude and Gemini next to DeepSeek, Qwen, Kimi and GLM. A Model Router tries the cheap model first, and AI credits let you start without a key.",
    points: ["Model Router", "Fallback models", "Monthly AI budgets"],
  },
  {
    key: "chat",
    icon: MessageSquareIcon,
    title: "Website chat widget and one-click chatbots",
    text: "Upload documents or paste page addresses and get a chatbot with a widget snippet, a share link and WhatsApp.",
    points: ["One script tag", "Handoff to a person"],
  },
  {
    key: "documents",
    icon: FileSearchIcon,
    title: "Documents and OCR",
    text: "Read invoices, scans and PDFs with a vision model, pull out the fields you name, and answer from your own documents with a Vector Store.",
    points: [getNodeLabel(NodeType.ANALYZE_DOCUMENT), "Vector Store (RAG)"],
  },
  {
    key: "builder",
    icon: SparklesIcon,
    title: "Build with AI",
    text: "Describe the workflow in a sentence and get it on the canvas, checked against the real node list. Ask for a change and it edits what is there. Nothing runs until you review and activate it.",
    points: [
      "Checked before it reaches the canvas",
      "Credentials are never filled in",
      "Undo the last change",
    ],
  },
];

export const STEPS = [
  {
    title: "Describe or drag",
    text: "Tell Build with AI what you need, start from a template, or drag nodes onto the canvas yourself.",
  },
  {
    title: "Connect your apps",
    text: "Add a credential once and pick it by name on any node. It is stored encrypted and never sent back to the browser.",
  },
  {
    title: "Run, monitor, approve",
    text: "Watch every node of a run live, read its input and output, and answer approval requests from wherever you are.",
  },
];

export type UseCase = {
  title: string;
  text: string;
  nodes: string[];
  // Matched against the names of the published templates
  template: RegExp;
};

export const USE_CASES: UseCase[] = [
  {
    title: "Customer support on WhatsApp",
    text: "An agent answers customers from your own documents and remembers each conversation.",
    nodes: labels(
      NodeType.WHATSAPP_TRIGGER,
      NodeType.AI_AGENT,
      NodeType.VECTOR_STORE,
      NodeType.WHATSAPP,
    ),
    template: /support|faq/i,
  },
  {
    title: "Invoice processing to Google Sheets",
    text: "Upload an invoice, read its fields with a vision model and add a row to your sheet.",
    nodes: labels(
      NodeType.FORM_TRIGGER,
      NodeType.ANALYZE_DOCUMENT,
      NodeType.GOOGLE_SHEETS,
    ),
    template: /invoice/i,
  },
  {
    title: "Lead qualification to CRM",
    text: "Ask what a lead needs, pull out the details and create the contact in your CRM.",
    nodes: labels(
      NodeType.CHAT_TRIGGER,
      NodeType.AI_AGENT,
      NodeType.INFORMATION_EXTRACTOR,
      NodeType.HUBSPOT,
    ),
    template: /lead/i,
  },
  {
    title: "E-commerce order updates",
    text: "Confirm paid orders and remind shoppers of abandoned carts from Shopify or WooCommerce.",
    nodes: labels(
      NodeType.SHOPIFY_TRIGGER,
      NodeType.WOOCOMMERCE_TRIGGER,
      NodeType.WHATSAPP,
      NodeType.GMAIL,
    ),
    template: /shopify|woocommerce|order/i,
  },
  {
    title: "Internal knowledge assistant",
    text: "A chat for your team that answers from handbooks and policies, and says so when it does not know.",
    nodes: labels(
      NodeType.CHAT_TRIGGER,
      NodeType.AI_AGENT,
      NodeType.DOCUMENT_LOADER,
      NodeType.VECTOR_STORE,
    ),
    template: /knowledge/i,
  },
];

export const SECURITY = [
  {
    icon: LockKeyholeIcon,
    title: "Encrypted credentials",
    text: "Stored with AES-256-GCM and decrypted only on the server when a node needs them. The browser never receives a saved secret.",
  },
  {
    icon: ShieldAlertIcon,
    title: "Tool risk levels and approvals",
    text: "Every agent tool is Read, Write or Dangerous. Dangerous tools are off until you allow them, and writes can wait for a person.",
  },
  {
    icon: CodeIcon,
    title: "Sandboxed code",
    text: "Code nodes and expressions run in QuickJS with no access to Node, the network or the filesystem, and with memory and time limits.",
  },
  {
    icon: KeyRoundIcon,
    title: "Two-factor and SSO",
    text: "Authenticator-app codes with backup codes, sign-in lockout, and single sign-on with OpenID Connect on the Pro plan.",
  },
  {
    icon: ScrollTextIcon,
    title: "Audit log",
    text: "Credential, workflow, API key and sign-in events with time and IP address. Lines are only ever added.",
  },
  {
    icon: UsersIcon,
    title: "Teams and roles",
    text: "Invite people as Viewer, Editor or Admin. Members use credentials by name and never see their values.",
  },
];

const free = PLAN_LIMITS.FREE;

export const FAQ = [
  {
    question: "Do I need my own API keys?",
    answer: `You can bring your own: connect a key for OpenAI, Anthropic, Gemini, DeepSeek, Kimi, Qwen or any OpenAI-compatible provider and pay that provider directly. Where "RXJ AI (included)" is offered, you can also run selected low-cost models without a key and pay with AI credits: ${number(PLAN_AI_CREDITS.FREE)} a month on Free, ${number(PLAN_AI_CREDITS.BEGINNER)} on Beginner, ${number(PLAN_AI_CREDITS.INTERMEDIATE)} on Intermediate and ${number(PLAN_AI_CREDITS.PRO)} on Pro. 1,000 credits are one US dollar of model cost.`,
  },
  {
    question: "What does the free trial include?",
    answer: `Seven days, starting when you sign up, with no card asked for. The trial unlocks the nodes that otherwise need a paid plan (scheduling, Google Sheets, Gmail, the AI Agent and WhatsApp) and every template. SSH and the enterprise features (SSO, Git sync, external secrets) are not part of it. The Free plan's limits still apply: ${free.activeWorkflows} active workflows, ${number(free.monthlyExecutions)} executions a month and daily caps on outgoing messages.`,
  },
  {
    question: "What happens when the trial ends?",
    answer: `Your account and workflows stay. You are on the Free plan (${free.activeWorkflows} active workflows, ${number(free.monthlyExecutions)} executions a month) and the plan-locked nodes ask for an upgrade. You can upgrade, downgrade or cancel at any time from Billing.`,
  },
  {
    question: "What counts as an execution?",
    answer:
      "One run of a workflow, however many nodes it has. A webhook call, a scheduled run, a form submission and each message sent to a chat widget are one execution each. Executions are counted per calendar month.",
  },
  {
    question: "Which models are supported?",
    answer:
      "OpenAI, Anthropic (Claude), Google Gemini, DeepSeek, Kimi and Qwen have their own nodes. The Chat Model node adds any OpenAI-compatible provider, with presets for OpenRouter, Groq, Together AI, Mistral, Zhipu GLM, MiniMax, Volcengine Ark, Xiaomi MiMo, SiliconFlow and Ollama, or a base URL you type in.",
  },
  {
    question: "Is my data safe?",
    answer:
      "Credentials are encrypted with AES-256-GCM and never sent to the browser. Every workflow, execution, credential and file belongs to one workspace. Credential values and common secret shapes are redacted from execution logs, and execution data is deleted after 7, 30 or 90 days, as you choose. When a model provider processes data in mainland China, the editor says so under the model field.",
  },
  {
    question: "Can I self-host RXJ?",
    answer:
      "RXJ is offered as a hosted service, and that is what the plans on this page are for. There is no packaged self-hosted edition at the moment.",
  },
  {
    question: "Does it work in Urdu and Arabic?",
    answer:
      "Yes. Starter templates come in English, Urdu and Arabic, and the website chat widget can run right to left.",
  },
];
