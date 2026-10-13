import { PLAN_LIMITS } from "@/config/plans";
import { NODE_COUNT } from "./content";

// The words of the Docs page (/docs): a getting-started guide. Like
// content.ts, everything here describes something the app does today (see
// README.md). Change a line only together with the feature.

export type DocsSection = {
  id: string;
  title: string;
  intro: string;
  // "Term: explanation" lines
  items?: { term: string; text: string }[];
  // A two-column table: code on the left, its meaning on the right
  table?: { head: [string, string]; rows: [string, string][] };
  note?: string;
};

const free = PLAN_LIMITS.FREE;

export const DOCS_SECTIONS: DocsSection[] = [
  {
    id: "account",
    title: "Create your account",
    intro:
      "Sign up with an email and password, or with Google or GitHub. No card is asked for.",
    items: [
      {
        term: "Free trial",
        text: "Seven days from the moment you sign up. It unlocks the nodes that otherwise need a paid plan (scheduling, Google Sheets, Gmail, the AI Agent and WhatsApp) and every template.",
      },
      {
        term: "After the trial",
        text: `Your account and workflows stay. You are on the Free plan: ${free.activeWorkflows} active workflows and ${free.monthlyExecutions.toLocaleString("en-US")} executions a month. Plan-locked nodes ask for an upgrade.`,
      },
      {
        term: "Two-factor sign-in",
        text: "Turn it on under Settings: codes from an authenticator app, with backup codes.",
      },
    ],
  },
  {
    id: "first-workflow",
    title: "Build your first workflow",
    intro: `A workflow is a trigger followed by the nodes that do the work. The editor has ${NODE_COUNT} node types. There are three ways to start.`,
    items: [
      {
        term: "Build with AI",
        text: "The button is on the Workflows page and at the top right of the editor. Describe what you need in a sentence and the workflow is put on the canvas. It uses one of your own model credentials. Credentials are never filled in for you, and nothing runs until you review and activate it.",
      },
      {
        term: "Start from a template",
        text: "The Templates page is a gallery of ready-made workflows in English, Urdu and Arabic. \"Use template\" copies one into your account; nodes that need your own account open as Not Configured.",
      },
      {
        term: "Drag nodes yourself",
        text: "Create a workflow, add a trigger, then add nodes and connect them. Open a node to fill in its settings.",
      },
    ],
    note: "Save the workflow, then use Execute workflow to try it. Switch it to Active when it should run from its schedule or webhook triggers.",
  },
  {
    id: "triggers",
    title: "Choose a trigger",
    intro:
      "The trigger decides when a workflow runs. These are the ones most workflows start with.",
    items: [
      {
        term: "Manual Trigger",
        text: "Runs when you click Execute workflow.",
      },
      {
        term: "Schedule Trigger",
        text: "Runs on a cron interval, checked every minute (for example */5 * * * * for every five minutes).",
      },
      {
        term: "Webhook Trigger",
        text: "Runs on an HTTP request to the workflow's own address, protected by a secret. It can answer at once, when the last node finishes, or with a Respond to Webhook node.",
      },
      {
        term: "Chat Trigger",
        text: "Runs on a message from the editor's chat panel or, with \"Make chat public\", from the hosted chat page or the website widget.",
      },
      {
        term: "Form Trigger",
        text: "Runs when someone submits the workflow's own hosted form.",
      },
      {
        term: "App triggers",
        text: "WhatsApp, Telegram, Messenger, Instagram, Gmail, Shopify, WooCommerce, Stripe, Typeform and RSS start a run when something happens there.",
      },
      {
        term: "Error Trigger",
        text: "Runs when a workflow fails, so you can send yourself an alert.",
      },
    ],
  },
  {
    id: "credentials",
    title: "Connect your apps",
    intro:
      "A credential is the key or sign-in a node uses to reach another service. Add it once on the Credentials page and pick it by name on any node.",
    items: [
      {
        term: "How it is stored",
        text: "Encrypted with AES-256-GCM and decrypted only on the server when a node needs it. A saved secret is never sent back to the browser.",
      },
      {
        term: "Google",
        text: "\"Sign in with Google\" covers Gmail, Google Drive, Google Sheets and Google Calendar.",
      },
      {
        term: "In the logs",
        text: "Credential values and common secret shapes are redacted from execution logs.",
      },
      {
        term: "In a team",
        text: "Members use credentials by name and never see their values.",
      },
    ],
  },
  {
    id: "expressions",
    title: "Use data from earlier nodes",
    intro:
      "Every node field accepts expressions in double curly braces. Each node saves its result under its variable name, and later nodes read it from there.",
    table: {
      head: ["Expression", "Meaning"],
      rows: [
        ["{{webhook.body.name}}", "A workflow variable"],
        ["{{json myApiCall}}", "An object or list as JSON"],
        [
          "{{ $json.price * $json.quantity }}",
          "Any JavaScript expression, run in a sandbox",
        ],
        [
          "{{ $('myApiCall').item.json.id }}",
          "Another node's result, by its variable name",
        ],
        [
          "{{ $now }}, {{ $today }}, {{ $itemIndex }}",
          "Current time, start of today, position in the list",
        ],
        [
          "{{ $fromAI('city') }}",
          "A value the AI Agent fills in when the node is its tool",
        ],
      ],
    },
    note: "After a node that returns a list, the nodes that follow run once per item, and $json is the current item.",
  },
  {
    id: "agents",
    title: "Add an AI agent",
    intro:
      "The AI Agent node has ports for a chat model, memory and tools. Connect a model node first; the rest is optional.",
    items: [
      {
        term: "Models",
        text: "OpenAI, Anthropic (Claude), Google Gemini, DeepSeek, Kimi and Qwen have their own nodes. The Chat Model node adds any OpenAI-compatible provider. A Model Router tries a cheap model first.",
      },
      {
        term: "RXJ AI (included)",
        text: "Where it is offered, selected low-cost models run without a key of your own and are paid with your plan's monthly AI credits.",
      },
      {
        term: "Tools",
        text: "Any node connected to the Tools port becomes a tool the model can call. Each tool is Read, Write or Dangerous; Dangerous tools are off until you allow them.",
      },
      {
        term: "Memory",
        text: "A memory node keeps one history per contact, so the agent remembers each conversation.",
      },
      {
        term: "Human approval",
        text: "A tool with Require approval does not run until a person approves it: on the Approvals page, or by email, Slack, Telegram or WhatsApp. A rejected or expired request is not run and the agent is told so.",
      },
    ],
  },
  {
    id: "monitor",
    title: "Run and monitor",
    intro:
      "While a workflow runs, each node on the canvas shows its state. Every run is kept on the Executions page with each node's input and output.",
    items: [
      {
        term: "When a node fails",
        text: "Set On Error (Stop or Continue) and Retry On Fail from the node's toolbar.",
      },
      {
        term: "Test one part",
        text: "Pin a node's output so it is not run again in the editor, or use Run this node only and Run from here. Live runs ignore pins.",
      },
      {
        term: "Waiting runs",
        text: "A run that waits for a time, a form or an approval shows as Waiting and can be cancelled.",
      },
      {
        term: "Retention",
        text: "Execution data is deleted after 7, 30 or 90 days, as you choose.",
      },
    ],
  },
  {
    id: "chatbots",
    title: "Make a chatbot without building the workflow",
    intro:
      "Chatbots in the sidebar creates a chatbot that answers from your own documents.",
    items: [
      {
        term: "What you give it",
        text: "A name, documents (PDF, Word .docx, .txt, .md or .csv, up to 3 MB each) or website addresses, the model that answers, and an OpenAI or Gemini credential for reading the documents.",
      },
      {
        term: "What you get",
        text: "A website widget snippet, a share link to a hosted chat page and, if you want, a WhatsApp connection.",
      },
      {
        term: "Behind it",
        text: "A normal workflow (Chat Trigger, AI Agent, memory and a Vector Store) that you can open and change in the editor.",
      },
    ],
  },
  {
    id: "plans",
    title: "Plans and limits",
    intro:
      "A plan sets how many workflows can be active, how many executions you have a month and which nodes are unlocked.",
    items: [
      {
        term: "An execution",
        text: "One run of a workflow, however many nodes it has. Executions are counted per calendar month.",
      },
      {
        term: "Changing plan",
        text: "Upgrade, downgrade or cancel at any time from Billing.",
      },
    ],
  },
];
