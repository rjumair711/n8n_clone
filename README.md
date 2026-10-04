# RXJ – AI Workflow Automation Platform

RXJ is a modern AI-native workflow automation platform inspired by tools like n8n, Zapier, and Make.com. It enables users to visually build, automate, and execute workflows using AI models, APIs, messaging systems, productivity tools, webhooks, and realtime execution pipelines.

The platform is designed as a scalable SaaS product with:

* visual workflow automation
* AI-first architecture
* realtime execution monitoring
* secure credential management
* multi-plan subscription system
* usage-based monetization
* onboarding and billing experience

---

# 🚀 Features

## 🎨 Visual Workflow Builder

* Drag-and-drop workflow editor powered by React Flow
* Dynamic node-based architecture
* Realtime node execution indicators
* Zoom, pan, and edge connection support
* Topological dependency resolution
* Shared execution context between nodes
* Modular execution engine

---

# ⚡ Workflow Execution Engine

* Branch-aware execution: only connections activated by IF / Switch / Filter are followed
* Loops that run a sub-flow once per list item
* Inngest background execution system
* Dynamic time-based execution engine via an automated Background Ticker (`* * * * *` clock matching system)
* Shared execution context
* Dynamic `{{variable}}` interpolation using Handlebars
* Execution persistence in PostgreSQL
* Realtime execution updates
* Retry handling and failure propagation
* Execution cancellation support

---

# 📜 Execution Logs & Monitoring

RXJ includes a comprehensive execution monitoring system.

## Execution Tracking

Every workflow execution stores:

* Execution ID
* Workflow ID
* Trigger source
* Execution timestamps
* Final execution status
* Runtime context data
* Error information

---

## Node Execution Logs

Each node execution stores:

| Field       | Description             |
| ----------- | ----------------------- |
| nodeId      | Unique node identifier  |
| type        | Node type               |
| status      | Current node state      |
| startedAt   | Execution start time    |
| completedAt | Completion timestamp    |
| input       | Incoming execution data |
| output      | Node output             |
| error       | Failure details         |

---

## Supported Node States

| Status  | Meaning   |
| ------- | --------- |
| initial | Waiting   |
| loading | Executing |
| success | Completed |
| error   | Failed    |

---

## Realtime Updates

Realtime workflow updates use:

* Inngest Realtime Channels
* Zustand stores
* React Flow node rendering

---

## Error Monitoring

* Sentry integration
* Stack trace monitoring
* Workflow failure propagation
* Node-level diagnostics
* Retry diagnostics

---

# 🧠 AI Integrations

## AI Agent (Tools Agent)

Works like the n8n AI Agent: a chat model that decides which tools to call and loops until it has an answer.

* **Chat Model (required):** connect an OpenAI, Anthropic or Gemini node to the Chat Model port; its credential and model are used.
* **Memory (optional):** a Buffer Memory node keeps the last N messages per session and replays them as real chat turns.
* **Tools (optional):** any node connected to the Tools port becomes a tool. Give each one a name and description in the agent's settings.
* **`{{$fromAI "name" "description"}}`:** write this in any field of a tool node to let the agent fill in that value.
* **Prompt source:** taken from the Chat Trigger (`{{chatInput}}`) or defined in the node with `{{variables}}`.
* **Options:** System Message, Max Iterations (default 10), Return Intermediate Steps.
* **Output:** `{{output}}` and `{{<variableName>.output}}`, plus `intermediateSteps` when enabled.
* **Chat panel:** workflows with a Chat Trigger get an "Open chat" button in the editor to talk to the agent.

## OpenAI

* GPT models
* Dynamic prompts
* Variable interpolation

## Anthropic Claude

* Claude Sonnet support
* Context-aware prompting

## Google Gemini

* Gemini models
* Structured AI chaining

---

# 🔔 Trigger Nodes

| Trigger             | Description                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| Manual Trigger      | Manual execution on user demand                                                                            |
| Schedule Trigger    | Time-based automatic triggers evaluated each minute using custom Cron intervals (e.g., `*/5 * * * *`)       |
| Webhook Trigger     | Runs on any HTTP request to `/api/webhooks/trigger/<workflowId>`, protected by a per-node secret            |
| Google Form Trigger | Form submission automation                                                                                 |
| Stripe Trigger      | Payment event automation                                                                                   |
| Chat Trigger        | Runs when a message is sent from the editor's chat panel; provides `chatInput` and `sessionId`             |

---

# ⚙️ Action Nodes

| Node             | Description                                                               |
| ---------------- | ------------------------------------------------------------------------- |
| AI Agent         | n8n-style Tools Agent with Chat Model, Memory and Tools sub-nodes         |
| HTTP Request     | External API requests                                                     |
| JavaScript Code  | Execute custom JavaScript in an isolated QuickJS (WebAssembly) sandbox    |
| Set Variable     | Store reusable variables                                                  |
| Filter           | Stop the current branch unless a condition is true                        |
| IF               | Route to a True or False output based on one or more conditions           |
| Switch           | Route to one of several outputs based on ordered rules, with a fallback   |
| Merge            | Join branches back into one path (any branch, or wait for all)            |
| Loop             | Run the connected nodes once for every item in a list                     |
| Delay            | Pause workflow                                                            |
| Webhook Response | Return webhook responses                                                  |
| Email Send       | SMTP email automation                                                     |
| Google Sheets    | Spreadsheet automation                                                    |
| Google Calendar  | Manage events (Create, Update, Delete) with dynamic value parsing         |
| Notion           | Interact with Notion workspaces (Create Pages, Query Databases)           |
| Date & Time      | Get current time, format, manipulate, or compare dates                    |
| Text Formatter   | Transform, clean, or extract text strings (Uppercase, Replace, Regex)     |
| Calculator       | Perform mathematical operations on numbers or variables                   |
| GitHub           | Create issues, comment on issues, list issues, read a repository          |
| Airtable         | List, create, update and delete records                                   |
| Postgres         | Run parameterised SQL, select rows, insert rows                           |


---

# 💬 Messaging Integrations

| Integration | Description         |
| ----------- | ------------------- |
| Discord     | Discord automation  |
| Slack       | Slack notifications |
| Telegram    | Bot Messaging       |
| WhatsApp    | Text and template messages via the WhatsApp Business Cloud API |
---

# 📊 Productivity Integrations

## Google Sheets

* Read spreadsheet data
* Append rows
* Dynamic value insertion
* Service account authentication

## Google Calendar

* Create calendar events
* Update event properties dynamically via Event ID patching
* Delete calendar events
* Dynamic value insertion using Handlebars templates
* Service account credential parsing and authentication

---

# 🔐 Credentials & Security

All credentials are encrypted before database storage using AES encryption.

Supported credential types:

| Type          | Used By       |
| ------------- | ------------- |
| OPENAI        | OpenAI Nodes  |
| ANTHROPIC     | Claude Nodes  |
| GEMINI        | Gemini Nodes  |
| SMTP          | Email Nodes   |
| GOOGLE_SHEETS | Google Sheets |
| GOOGLE_CALENDAR | Google Calendar |
| NOTION        | Notion Nodes  |
| TELEGRAM      | Telegram Nodes|
| GITHUB        | GitHub Nodes (personal access token) |
| AIRTABLE      | Airtable Nodes (personal access token) |
| POSTGRES      | Postgres Nodes (connection string) |
| WHATSAPP      | WhatsApp Nodes (Cloud API access token) |

---

# 💳 SaaS Billing & Subscription System

RXJ includes a complete SaaS monetization architecture powered by Polar.

## SaaS Features

* Automatic 7-day free trial user allocation upon signup
* Dynamic plan detection and runtime casting via Prisma Enums
* Usage-based monetization
* Workflow usage tracking
* Execution usage tracking
* Credential usage limits
* Billing management page
* Polar customer portal integration
* Better Auth Polar webhook sub-plugin lifecycle syncing architecture
* Real-time dynamic tier upgrades and revoked downgrades matching checkout selections
* Dynamic sidebar plan UI with live checkout state cache invalidation

---

# 📊 Usage Tracking System

RXJ tracks:

* workflow usage
* monthly executions
* credential limits
* current subscription plan
* trial duration

Users can view:

* workflows used
* executions used
* current plan
* remaining trial days

---

# 🎯 Onboarding System

RXJ includes onboarding UX to improve activation and retention.

## Current Features

* First-time onboarding page
* Create workflow CTA
* Starter workflow templates
* Guided product introduction
* Trial onboarding flow with proactive expiration countdowns

## Planned Improvements

* Interactive onboarding checklist
* Workflow cloning templates
* Guided node setup
* AI workflow generation
* Template marketplace

---

# 🗺️ Node Roadmap (Planned)

Nodes that are not built yet, listed in the order they are most worth adding. Each new integration is a config passed to `createIntegrationNode` plus an executor; see `src/features/executions/components/github` for the pattern.

## Core (most valuable)

| Node | What it adds |
| ---- | ------------ |
| HTTP Request upgrade | Custom headers, query parameters and authentication. Today the node can only send a JSON body, which blocks most APIs |
| Edit Fields | Set several values in one node instead of one Set Variable per value |
| Respond to Webhook | Send a real synchronous reply to the caller of a Webhook Trigger |
| Execute Sub-workflow | Call another workflow and use its result |
| Error Trigger | Start a workflow when another workflow fails, for alerts |
| List tools | Split Out, Aggregate, Sort, Limit, Remove Duplicates |

## AI

| Node | What it adds |
| ---- | ------------ |
| OpenAI-compatible Chat Model | One node for Groq, OpenRouter, DeepSeek and Ollama (base URL + key + model). Cheap or free models for the community |
| Structured Output Parser | Make the AI Agent return JSON in a fixed shape |
| Embeddings + Vector Store | Question answering over documents; Neon supports pgvector |
| Information Extractor / Text Classifier | Common single-purpose AI steps without writing prompts |

## Triggers and apps

| Node | What it adds |
| ---- | ------------ |
| Telegram Trigger | Start a workflow on an incoming Telegram message. With the AI Agent this makes a full chatbot |
| WhatsApp Trigger | The same for incoming WhatsApp messages (Cloud API webhook) |
| Google sign-in (OAuth) | Unlocks Gmail, Google Drive and Google Docs nodes; these APIs cannot use a simple token |
| Gmail | Send, read and label emails (needs Google OAuth) |
| Google Drive / Docs | Upload, list and read files (needs Google OAuth) |
| MySQL, MongoDB, Supabase | More databases next to Postgres |
| RSS Read | Poll a feed for new items |
| Twilio SMS | Send text messages |

---


# 🛠️ Tech Stack

## Frontend

* Next.js App Router
* React
* TypeScript
* React Flow
* Tailwind CSS
* Shadcn UI
* Zustand
* TanStack Query
* Jotai

---

## Backend

* Next.js API Routes
* tRPC
* Prisma ORM
* Neon PostgreSQL
* Better Auth
* Polar
* Inngest (Background Workers & Event Streams)
* Nodemailer

---

## AI SDKs

* Vercel AI SDK (Agent Orchestration & Tool Calling)
* OpenAI SDK
* Anthropic SDK
* Google Gemini SDK

---

## Monitoring & Dev Tools

* Sentry
* GitHub
* CodeRabbit
* Vercel

---

# 🧱 System Architecture

```txt
Frontend UI
   ↓
React Flow Workflow Builder
   ↓
Next.js App Router
   ↓
tRPC API Layer
   ↓
Prisma ORM
   ↓
Neon PostgreSQL

Workflow Execution Engine
   ↓
Inngest Background Jobs & Cron Heartbeats
   ↓
Node Executors
   ↓
External APIs / AI Providers / Messaging Services