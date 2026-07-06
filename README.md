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

* Sequential workflow execution pipeline
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

## Autonomous AI Agent
* **Dynamic Orchestration:** Automatically utilizes connected nodes (like HTTP Requests or JavaScript) as executing tools.
* **Dependency Injection:** Lazily loads configurations (API keys, models, system prompts) directly from connected UI nodes.
* **Contextual Memory:** Integrates with Buffer Memory nodes to retrieve and persist conversation history.
* **Realtime Thought Logging:** Broadcasts step-by-step reasoning and tool-calling decisions to the frontend during execution.

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
| Webhook Trigger     | External HTTP requests inbound routing                                                                     |
| Google Form Trigger | Form submission automation                                                                                 |
| Stripe Trigger      | Payment event automation                                                                                   |

---

# ⚙️ Action Nodes

| Node             | Description                                                               |
| ---------------- | ------------------------------------------------------------------------- |
| AI Agent         | Autonomous LLM loop that dynamically utilizes connected nodes as tools    |
| HTTP Request     | External API requests                                                     |
| JavaScript Code  | Execute custom JavaScript code within the shared execution context        |
| Set Variable     | Store reusable variables                                                  |
| Filter           | Conditional branching                                                     |
| Delay            | Pause workflow                                                            |
| Webhook Response | Return webhook responses                                                  |
| Email Send       | SMTP email automation                                                     |
| Google Sheets    | Spreadsheet automation                                                    |
| Google Calendar  | Manage events (Create, Update, Delete) with dynamic value parsing         |
| Notion           | Interact with Notion workspaces (Create Pages, Query Databases)           |
| Date & Time      | Get current time, format, manipulate, or compare dates                    |
| Text Formatter   | Transform, clean, or extract text strings (Uppercase, Replace, Regex)     |
| Calculator       | Perform mathematical operations on numbers or variables                   |


---

# 💬 Messaging Integrations

| Integration | Description         |
| ----------- | ------------------- |
| Discord     | Discord automation  |
| Slack       | Slack notifications |
| Telegram    | Bot Messaging       |
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
| TEELGRAM      | Telegram Nodes|

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