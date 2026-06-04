# RJBase – AI Workflow Automation Platform

RJBase is a modern AI-native workflow automation platform inspired by tools like n8n, Zapier, and Make.com. It enables users to visually build, automate, and execute workflows using AI models, APIs, messaging systems, productivity tools, webhooks, and realtime execution pipelines.

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
* Shared execution context
* Dynamic `{{variable}}` interpolation using Handlebars
* Execution persistence in PostgreSQL
* Realtime execution updates
* Retry handling and failure propagation
* Execution cancellation support

---

# 📜 Execution Logs & Monitoring

RJBase includes a comprehensive execution monitoring system.

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

| Trigger             | Description                                |
| ------------------- | ------------------------------------------ |
| Manual Trigger      | Manual execution                           |
| Webhook Trigger     | External HTTP requests                     |
| Google Form Trigger | Form submission automation                 |
| Stripe Trigger      | Payment event automation                   |

---

# ⚙️ Action Nodes

| Node             | Description                              |
| ---------------- | ---------------------------------------- |
| HTTP Request     | External API requests                    |
| Set Variable     | Store reusable variables                 |
| Filter           | Conditional branching                    |
| Delay            | Pause workflow                           |
| Webhook Response | Return webhook responses                 |
| Email Send       | SMTP email automation                    |
| Google Sheets    | Spreadsheet automation                   |

---

# 💬 Messaging Integrations

| Integration | Description         |
| ----------- | ------------------- |
| Discord     | Discord automation  |
| Slack       | Slack notifications |

---

# 📊 Productivity Integrations

## Google Sheets

* Read spreadsheet data
* Append rows
* Dynamic value insertion
* Service account authentication

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

---

# 💳 SaaS Billing & Subscription System

RJBase includes a complete SaaS monetization architecture powered by Polar.

## Subscription Plans

### FREE Trial

* Limited workflows
* Limited executions
* Limited credentials
* 7-day automatic signup trial duration

### Beginner Plan

* Starter workflow limits
* AI integrations
* Basic execution tracking

### Intermediate Plan

* Increased workflow limits
* Scheduling support
* Productivity integrations

### Pro Plan

* High execution limits
* Advanced automation
* Team-ready scaling

---

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

RJBase tracks:

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

RJBase includes onboarding UX to improve activation and retention.

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
* Inngest
* Nodemailer

---

## AI SDKs

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
Inngest Background Jobs
   ↓
Node Executors
   ↓
External APIs / AI Providers / Messaging Services
📂 Project Structure
Plaintext
/src
├── /app
├── /components
├── /features
├── /inngest
├── /lib
├── /config
├── /trpc
└── /hooks
⚙️ Workflow Execution Flow
1. Trigger Activation
Manual execution

Webhooks

External events

2. Dependency Resolution
Nodes are sorted before execution using topological sorting.

3. Plan Verification
Workflow and execution limits are verified.

4. Node Execution
Each node processes workflow context and returns updated data.

5. Variable Interpolation
Handlebars
{{user.email}}
{{openai.response}}
{{form.responses.name}}
6. Realtime Updates
Execution states synchronize instantly with frontend UI.

7. Error Handling
Critical failures automatically stop workflow execution.

8. Completion
Executions finalize as:

SUCCESS

FAILED

Execution logs are persisted.

🌍 Environment Variables
Code snippet
DATABASE_URL=
BETTER_AUTH_SECRET=
POLAR_ACCESS_TOKEN=
POLAR_SERVER=
POLAR_SUCCESS_URL=
POLAR_WEBHOOK_SECRET=
POLAR_BEGINNER_PRODUCT_ID=
POLAR_INTERMEDIATE_PRODUCT_ID=
POLAR_PRO_PRODUCT_ID=

OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=

INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

SENTRY_DSN=
🚀 Deployment
Recommended Platforms
Vercel

Neon PostgreSQL

Inngest Cloud

📈 Future Improvements
Phase A — Dynamic SaaS UI
Dynamic sidebar usage system

Trial countdown

Plan-aware UI

Phase B — Premium Feature Locking (Planned For Final Stage)
WhatsApp 🔒 Pro

AI Agents 🔒 Pro

Browser Automation 🔒 Pro

Upgrade modals

Premium node locking system

Phase C — Billing Management
Billing page

Usage dashboard

Upgrade/downgrade flow

Subscription management

Phase D — Onboarding UX
Welcome onboarding

Starter templates

Guided workflow creation

Product activation system

Phase E — Advanced SaaS Features (Planned For Final Stage)
Team workspaces

Organizations

API keys

Workflow marketplace

Analytics dashboard

Template sharing

Browser automation

📄 License
MIT License

👨‍💻 Author
RJBase is a modern AI workflow automation SaaS platform inspired by enterprise-grade systems like n8n, Zapier, Make.com, Vercel, and Linear.