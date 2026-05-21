# RJBase – AI Workflow Automation Platform

RJBase is a low-cost AI workflow automation platform inspired by tools like n8n. It allows users to create, manage, and execute automated workflows using a visual drag-and-drop builder.

The platform supports trigger nodes, AI integrations, messaging nodes, HTTP requests, email sending, background job execution, authentication, subscriptions, and execution history.

---

## 🚀 Features

### Workflow Builder
- Visual drag-and-drop workflow builder powered by React Flow
- Real-time node status indicators (loading, success, error)
- Topological sort-based sequential node execution
- Context passing between nodes with `{{variable}}` interpolation via Handlebars

### Trigger Nodes
- **Manual Trigger** — execute workflows on demand
- **Webhook Trigger** — trigger workflows via incoming HTTP requests
- **Google Form Trigger** — trigger workflows from Google Form submissions
- **Stripe Trigger** — trigger workflows from Stripe payment events

### Action Nodes
- **HTTP Request** — make outbound HTTP calls and pass response data downstream
- **Set Variable** — set named variables for use in subsequent nodes
- **Filter** — conditional logic to branch or stop workflow execution
- **Delay** — introduce timed pauses (seconds, minutes, or hours)
- **Webhook Response** — send HTTP responses back to webhook callers
- **Email Send** — send emails via SMTP with dynamic subject, recipient, and body using `{{variables}}`
- **Google Sheets** — read and write data to Google Sheets

### AI Integrations
- **OpenAI** — GPT models with system and user prompt support
- **Anthropic Claude** — Claude models with system and user prompt support
- **Google Gemini** — Gemini models with system and user prompt support

### Messaging Integrations
- **Discord** — send messages to Discord channels
- **Slack** — send messages to Slack channels

### Productivity Integrations
- **Google Sheets** — append workflow data directly into spreadsheets using Google Service Accounts

### Platform Features
- Secure credentials management with AES encryption at rest
- Subscription-based access control (Pro plan with execution and workflow limits)
- Background workflow execution via Inngest
- Execution history with status tracking (running, success, failed)
- Error tracking and monitoring via Sentry
- User authentication via Better Auth
- Payment and subscription management via Polar
- Type-safe API layer via tRPC

---

## 🛠️ Technologies Used

### Frontend
- Next.js App Router
- React + TypeScript
- React Flow (drag-and-drop workflow builder)
- Tailwind CSS
- Shadcn UI
- TanStack React Query
- Sonner Toasts

### Backend
- Next.js API Routes
- tRPC
- Prisma ORM
- Neon PostgreSQL
- Inngest (background job execution)
- Better Auth (authentication)
- Polar (payments and subscriptions)
- Nodemailer (SMTP email sending)

### AI Integrations
- OpenAI API
- Google Gemini API (`@ai-sdk/google`)
- Anthropic Claude API

### Monitoring & Developer Tools
- Sentry (error tracking)
- CodeRabbit (AI-powered code reviews)
- GitHub (version control)
- Vercel (deployment)

---

## 🧠 Project Architecture

```
Frontend UI
   ↓
Next.js App Router
   ↓
tRPC API Layer
   ↓
Prisma ORM
   ↓
Neon PostgreSQL

Workflow Execution
   ↓
Inngest Background Jobs
   ↓
Node Executors
   ↓
External APIs / AI Providers / Messaging Services / SMTP
```

---

## 🔨 Folder Structure

```
/src
├── /components
│   ├── /ui                  # Reusable UI components (buttons, inputs, dialogs, etc.)
│   ├── /react-flow          # Components related to the drag-and-drop workflow builder
│   └── /node-status         # Node status indicators
├── /features
│   ├── /executions          # Execution logic for all node types
│   ├── /hooks               # Custom hooks (e.g., node status management)
│   ├── /nodes               # Custom node components and dialogs
│   ├── /credentials         # Credential management (create, update, delete, fetch by type)
│   ├── /channels            # Channels for connecting with external services
│   └── /dialog              # Shared dialog components
├── /inngest
│   ├── /client              # Inngest client configuration
│   ├── /channels            # Realtime channel definitions per node type
│   ├── /functions           # Core workflow execution function
│   ├── /utils               # Utility functions (topological sort, error handling, etc.)
│   └── /actions             # Server actions for fetching subscription tokens
├── /lib
│   ├── /db                  # Prisma client
│   └── /encryption          # AES encrypt/decrypt for credential values
└── /pages
    ├── /api                 # API routes (Inngest webhook, auth, etc.)
    └── /workflow            # Workflow management frontend pages
```

---

## 📂 Detailed Node Breakdown

### Trigger Nodes (`/features/nodes`)

| Node | Files | Description |
|---|---|---|
| Manual Trigger | `ManualTriggerNode.tsx`, `ManualTriggerDialog.tsx` | Execute workflows on demand from the UI |
| Webhook Trigger | `WebhookNode.tsx`, `WebhookDialog.tsx` | Receive and process incoming webhook payloads |
| Google Form Trigger | `GoogleFormTriggerNode.tsx`, `GoogleFormTriggerDialog.tsx` | Trigger on Google Form submissions |
| Stripe Trigger | `StripeTriggerNode.tsx`, `StripeTriggerDialog.tsx` | Trigger on Stripe payment events |

### Action Nodes (`/features/nodes`)

| Node | Files | Description |
|---|---|---|
| HTTP Request | `HttpRequestNode.tsx`, `HttpRequestDialog.tsx` | Make outbound HTTP calls |
| Set Variable | `SetVariableNode.tsx`, `SetVariableDialog.tsx` | Set named variables for downstream nodes |
| Filter | `FilterNode.tsx`, `FilterDialog.tsx` | Conditional logic; stops execution if condition fails |
| Delay | `DelayNode.tsx`, `DelayDialog.tsx` | Timed pause (seconds, minutes, hours) |
| Webhook Response | `WebhookResponseNode.tsx`, `WebhookResponseDialog.tsx` | Send HTTP responses back to webhook callers |
| Email Send | `EmailSendNode.tsx`, `EmailDialog.tsx` | Send SMTP emails with dynamic content via Handlebars |
| Google Sheets | `GoogleSheetsNode.tsx`, `GoogleSheetsDialog.tsx` | Read and write Google Sheets data |

### AI Nodes (`/features/nodes`)

| Node | Files | Description |
|---|---|---|
| OpenAI | `OpenAINode.tsx`, `OpenAIDialog.tsx` | GPT model inference with system/user prompts |
| Anthropic | `AnthropicNode.tsx`, `AnthropicDialog.tsx` | Claude model inference with system/user prompts |
| Gemini | `GeminiNode.tsx`, `GeminiDialog.tsx` | Gemini model inference with system/user prompts |

### Messaging Nodes (`/features/nodes`)

| Node | Files | Description |
|---|---|---|
| Discord | `DiscordNode.tsx`, `DiscordDialog.tsx` | Send messages to Discord channels |
| Slack | `SlackNode.tsx`, `SlackDialog.tsx` | Send messages to Slack channels |

---

## ⚙️ Workflow Execution Process

1. **Trigger** — the workflow begins with a trigger node (manual, webhook, Google Form, or Stripe)
2. **Topological Sort** — nodes are sorted by dependency order before execution begins
3. **Plan Limit Check** — the user's monthly execution count is verified against their Pro plan limit
4. **Node Execution** — each node runs sequentially, receiving and returning a shared `context` object
5. **Context Passing** — every executor receives the full workflow context and returns an updated version. Dynamic `{{variables}}` are resolved at runtime using Handlebars in prompts, HTTP requests, emails, Google Sheets row values, and other node configurations.
6. **Real-Time Updates** — each node publishes status events (`loading`, `success`, `error`) to its Inngest realtime channel so the UI updates live during execution
7. **Filter Short-Circuit** — if a Filter node fails its condition, execution stops immediately for downstream nodes
8. **Completion** — the execution record is updated to `SUCCESS` or `FAILED` in the database with output and error details

---

## 🔐 Credentials

All credentials (API keys, SMTP settings) are encrypted with AES before being stored in the database. Credentials are scoped per user and fetched by type via tRPC (`credentials.getByType`).

Supported credential types:

| Type | Used By |
|---|---|
| `OPENAI` | OpenAI node |
| `ANTHROPIC` | Anthropic node |
| `GEMINI` | Gemini node |
| `SMTP` | Email Send node |
| `GOOGLE_SHEETS` | Google Sheets node |

SMTP credentials store a JSON object containing `host`, `port`, `user`, `pass`, and optional `fromName`, encrypted at rest.

---

## 📋 Environment Variables

```env
DATABASE_URL=
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
BETTER_AUTH_SECRET=
POLAR_ACCESS_TOKEN=
SENTRY_DSN=
```