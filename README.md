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
* a public API for running workflows from your own code

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
* Per-node error handling from the node toolbar: On Error (Stop / Continue), Retry On Fail, Execute Once

---

# ⚡ Workflow Execution Engine

* Branch-aware execution: only connections activated by IF / Switch / Filter / Text Classifier are followed
* Loops that run a sub-flow once per list item
* Per-item execution after list nodes (see below)
* Sub-workflows: one workflow can call another and use its result
* Error handling: Retry On Fail, Continue on error, Error Trigger, Stop and Error
* Inngest background execution system
* Dynamic time-based execution engine via an automated Background Ticker (`* * * * *` clock matching system)
* Shared execution context
* Dynamic `{{variable}}` interpolation using Handlebars, plus n8n-style `{{ $json.field }}` expressions
* Execution persistence in PostgreSQL
* Realtime execution updates
* Retry handling and failure propagation
* Execution cancellation support

## Per-item execution

Like n8n, nodes run once per item after a list node.

* **Where it starts:** Split Out, Sort, Limit, Remove Duplicates, Summarize, RSS Read, Extract from File (CSV rows), or a Merge that combines lists send their list onward as items.
* **What happens next:** every following node runs once per item. The item is `{{item}}` or `{{ $json }}`, for example `{{item.name}}` or `{{ $json.name }}`.
* **Routing:** IF, Filter, Switch and Text Classifier decide per item, so both IF branches can run, each with its own items.
* **Paired data:** a later node's reference to an earlier node's variable gives the result for the same item.
* **Where it ends:** an Aggregate, Loop or Convert to File node. After it, nodes run once again and each per-item node's variable holds `{ items, count }`.
* **Execute Once** (node toolbar) runs a node for the first item only.

Without a list node nothing changes: every node runs once. An HTTP Request or Code node that returns a list does not split into items by itself; add a Split Out after it. At most 100 items can reach one node (`MAX_ITEMS_PER_NODE`).

## Expressions

Both syntaxes work in every node field, side by side.

| Syntax | Meaning |
| ------ | ------- |
| `{{webhook.body.name}}` | A workflow variable (Handlebars) |
| `{{json myApiCall}}` | An object or list as JSON |
| `{{ $json.webhook.body.name }}` | The same variable, n8n style. Inside a list, `$json` is the current item |
| `{{ $json.price * $json.quantity }}` | Any JavaScript expression, run in a sandbox |
| `{{ $('myApiCall').item.json.id }}` | Another node's result, by its variable name |
| `{{ $now }}`, `{{ $today }}`, `{{ $itemIndex }}` | Current time, start of today, position in the list |
| `{{$fromAI "city" "The city"}}` / `{{ $fromAI('city') }}` | A value the AI Agent fills in when the node is its tool |
| `{{shellQuote webhook.body.name}}` | A value made safe to put into an SSH command |

Differences from n8n: `$json` is the whole set of workflow variables (not the previous node's output) unless the node is running for an item; `$('name')` looks up a variable name; `$now` is a plain date with `toISO()`, not a Luxon object.

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

* **Chat Model (required):** connect an OpenAI, Anthropic, Gemini or Chat Model node to the Chat Model port; its credential and model are used.
* **Parser (optional):** a Structured Output Parser makes the agent answer with JSON in a structure you define; `{{output}}` becomes an object.
* **Memory (optional):** a Buffer Memory node keeps the last N messages per session and replays them as real chat turns.
* **Tools (optional):** any node connected to the Tools port becomes a tool. Give each one a name and description in the agent's settings. An MCP Client node adds all the tools of an MCP server; an Execute Workflow node makes another workflow a tool; a Vector Store node lets the agent search your documents.
* **`{{$fromAI "name" "description"}}`:** write this in any field of a tool node to let the agent fill in that value.
* **Prompt source:** taken from the trigger (`{{chatInput}}`, set by the Chat, Telegram and WhatsApp triggers) or defined in the node with `{{variables}}`.
* **Options:** System Message, Max Iterations (default 10), Return Intermediate Steps.
* **Output:** `{{output}}` and `{{<variableName>.output}}`, plus `intermediateSteps` when enabled.
* **Chat panel:** workflows with a Chat Trigger get an "Open chat" button in the editor to talk to the agent.

## Model nodes

| Node | Description |
| ---- | ----------- |
| OpenAI | GPT models with dynamic prompts |
| Anthropic | Claude models (default `claude-sonnet-5-5`) |
| Gemini | Google Gemini models |
| Chat Model | Any OpenAI-compatible API: OpenRouter, Groq, DeepSeek, Mistral, Together, Ollama or a custom base URL |

## AI nodes

| Node | Description |
| ---- | ----------- |
| Text Classifier | Sorts text into your categories with a connected model and continues on that category's output |
| Information Extractor | Pulls named values (`name (type): description`) out of free text |
| Structured Output Parser | Plugs into the AI Agent's Parser port to force a JSON structure |
| Vector Store | Insert, search and delete documents by meaning (RAG), with OpenAI, Gemini or OpenAI-compatible embeddings. Stored in Postgres and compared in the app; not pgvector |
| MCP Client | Gives an AI Agent the tools of an MCP server (Streamable HTTP transport) |

---

# 🔔 Trigger Nodes

| Trigger             | Description                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| Manual Trigger      | Manual execution on user demand                                                                            |
| Schedule Trigger    | Time-based automatic triggers evaluated each minute using custom Cron intervals (e.g., `*/5 * * * *`)       |
| Webhook Trigger     | Runs on any HTTP request to `/api/webhooks/trigger/<workflowId>`, protected by a per-node secret. Respond immediately, when the last node finishes, or with a Respond to Webhook node |
| Chat Trigger        | Runs when a message is sent from the editor's chat panel; provides `chatInput` and `sessionId`             |
| Telegram Trigger    | Runs when your bot receives a message. The bot's webhook is registered when the workflow is activated      |
| WhatsApp Trigger    | Runs when your WhatsApp Business number receives a message (verify token + signature check)                |
| Gmail Trigger       | Runs when a new email arrives; polls every 1, 5, 15 or 60 minutes with an optional Gmail search filter      |
| Typeform Trigger    | Runs when a typeform is submitted; answers are available by question title                                 |
| RSS Feed Trigger    | Runs when a new item appears in an RSS or Atom feed; polls every 1, 5, 15, 60 minutes or daily             |
| Google Form Trigger | Form submission automation                                                                                 |
| Stripe Trigger      | Payment event automation                                                                                   |
| Error Trigger       | Runs when a workflow fails (this workflow, or all of your workflows), for alerts                           |
| When Executed by Another Workflow | Start of a sub-workflow called by an Execute Workflow node or an AI Agent tool               |

Telegram, WhatsApp, Typeform and Stripe need `NEXT_PUBLIC_APP_URL` to be a public https address. Every webhook route is rate limited per workflow.

## Duplicate deliveries and retry

Providers re-send an event when they are unsure it arrived. Each trigger remembers the events it accepted for 7 days and ignores a repeat:

| Trigger | Recognised by |
| ------- | ------------- |
| Stripe | The event id |
| WhatsApp | The message id |
| Telegram | The update id |
| Typeform | The submission's event id |
| Google Form | The response id |
| Gmail, RSS Feed | The message or item id |
| Webhook | An optional `Idempotency-Key` (or `X-Idempotency-Key`) header sent by the caller; a repeat answers `{ "duplicate": true }` |

Every execution also keeps the trigger and the data it started with, so it can be run again: **Retry** on a failed execution's page (or **Run again** on a successful one), or `POST /api/v1/executions/:id/retry`. A retry uses the workflow as it is now, which is how a failed webhook delivery is replayed after the workflow has been fixed.

---

# ⚙️ Action Nodes

## Core and flow

| Node             | Description                                                               |
| ---------------- | ------------------------------------------------------------------------- |
| AI Agent         | n8n-style Tools Agent with Chat Model, Parser, Memory and Tools sub-nodes |
| HTTP Request     | Call any API: headers, query parameters, Basic / Bearer / Header auth from credentials, JSON / form / raw bodies, timeout, Never Error. Response Format "File" stores a download. Private and local addresses are blocked |
| RSS Read         | Read the items of an RSS or Atom feed; the following nodes run once per item |
| Respond to Webhook | Answer the HTTP request that started the workflow (JSON, text, redirect, status code, headers) |
| Webhook Callback | POST the workflow's data to another URL                                   |
| Execute Workflow | Run another workflow and use its result; also works as an AI Agent tool   |
| SSH              | Run a command on your own server and get its output and exit code. Pro plan only |
| JavaScript Code  | Execute custom JavaScript in an isolated QuickJS (WebAssembly) sandbox    |
| Set Variable     | Store reusable variables                                                  |
| Filter           | Stop the current branch unless a condition is true                        |
| IF               | Route to a True or False output based on one or more conditions           |
| Switch           | Route to one of several outputs based on ordered rules, with a fallback   |
| Merge            | Join branches back into one path; optionally append or join two lists     |
| Loop             | Run the connected nodes once for every item in a list                     |
| Stop and Error   | Fail the workflow with your own message                                   |
| Delay            | Pause workflow                                                            |
| Date & Time      | Get current time, format, manipulate, or compare dates                    |
| Text Formatter   | Transform, clean, or extract text strings (Uppercase, Replace, Regex)     |
| Calculator       | Perform mathematical operations on numbers or variables                   |

## Data transformation

| Node              | Description                                                              |
| ----------------- | ------------------------------------------------------------------------ |
| Edit Fields       | Set, keep, remove and rename fields (`name (type) = value` per line). After a list node it reshapes every item, like a map |
| Split Out         | Turn a list inside your data into separate items                         |
| Aggregate         | Combine a field from many items into one list; ends a per-item section   |
| Sort              | Order the items of a list by a field                                     |
| Limit             | Keep only the first or last items                                        |
| Remove Duplicates | Remove items that repeat an earlier item                                 |
| Summarize         | Count, sum, average, min, max per group, like a pivot table              |

## Files

Files do not travel inside the workflow data. A node that makes or fetches a file stores it and puts a reference in its result: `{ id, fileName, mimeType, size, url }`. To use the file in another node, type its variable into that node's **File** field, for example `pdf.file` or `myApiCall.httpResponse.file`. The `url` is a download link for the signed-in owner.

| Node              | Description                                                              |
| ----------------- | ------------------------------------------------------------------------ |
| PDF Generator     | Make a PDF from text with headings (`#`), bullets (`-`) and rules (`---`). Supports Latin, Cyrillic, Greek, Arabic, Urdu and Persian text, including right-to-left layout and mixed lines |
| Convert to File   | Turn a list into an Excel (XLSX) or CSV spreadsheet, any value into JSON, or text into a text file |
| Extract from File | Read a file back into workflow data: the rows of an Excel or CSV sheet (which continue as items), the text of a PDF or Word (DOCX) file, JSON, or plain text |

Files come from PDF Generator, Convert to File, Google Drive (Download) and HTTP Request (Response Format: File). They can be:

* attached to an email with Gmail, Email (SMTP), Resend or SendGrid (the **Attachments** field takes several, comma-separated)
* sent as a document with Telegram (**Attach File**) or WhatsApp (**Send File**; pictures, video and audio show inline)
* uploaded to Google Drive
* read with Extract from File

The PDF Generator uses the fonts built into PDF readers for plain Latin text and switches to the bundled Noto fonts in `assets/fonts` for other scripts. Text in Arabic script looks right on the page, but copying or searching it inside the PDF is unreliable.

Limits: 10 MB per file (`MAX_FILE_SIZE_MB`), 200 MB stored per user (`MAX_USER_STORAGE_MB`), and files are deleted after 7 days (`FILE_RETENTION_DAYS`).

## Apps and databases

| Node             | Description                                                               |
| ---------------- | ------------------------------------------------------------------------- |
| Google Sheets    | Append rows (Google account or service account)                           |
| Google Calendar  | Create, update and delete events (Google account or service account)      |
| Google Drive     | Search, upload, download, create folder, delete. Google Docs and Slides download as PDF, Sheets as CSV |
| Gmail            | Send (with file attachments), reply, search, get and mark messages as read |
| Notion           | Create pages, query databases                                             |
| GitHub           | Create issues, comment on issues, list issues, read a repository          |
| Airtable         | List, create, update and delete records                                   |
| Jira             | Create issue, get issue, search with JQL, add comment (Jira Cloud)        |
| HubSpot          | Create, get, update and search contacts; create deals                     |
| Salesforce       | Query with SOQL, and create, get, update and delete records of any object |
| Postgres         | Run parameterised SQL, select rows, insert rows. Expressions go in Query Parameters, not in the query text |
| MySQL            | Run parameterised SQL, select rows, insert rows (MySQL and MariaDB). Same rule for expressions |

---

# 💬 Messaging Integrations

| Integration | Description         |
| ----------- | ------------------- |
| Discord     | Discord automation  |
| Slack       | Slack notifications |
| Telegram    | Bot messaging: text, or a file with a caption, and the Telegram Trigger for incoming messages |
| WhatsApp    | Text, template and file messages via the WhatsApp Business Cloud API, and the WhatsApp Trigger |
| Twilio      | SMS and WhatsApp messages |
| Email       | SMTP email, with file attachments |
| Gmail       | Email through a connected Google account, with file attachments |
| Resend      | Email through the Resend API, with file attachments |
| SendGrid    | Email through the SendGrid API, with file attachments |

---

# 🔐 Credentials & Security

All credentials are encrypted before database storage using AES encryption.

Supported credential types:

| Type          | Used By       |
| ------------- | ------------- |
| OPENAI        | OpenAI nodes, Vector Store embeddings |
| ANTHROPIC     | Claude nodes  |
| GEMINI        | Gemini nodes, Vector Store embeddings |
| OPENAI_COMPATIBLE | Chat Model node (OpenRouter, Groq, DeepSeek, Ollama...) |
| SMTP          | Email node    |
| GOOGLE_OAUTH2 | Gmail, Gmail Trigger, Google Drive, Google Sheets, Google Calendar ("Sign in with Google") |
| GOOGLE_SHEETS | Google Sheets (service account) |
| GOOGLE_CALENDAR | Google Calendar (service account) |
| NOTION        | Notion nodes  |
| TELEGRAM      | Telegram node and Telegram Trigger |
| WHATSAPP      | WhatsApp node (Cloud API access token) |
| TWILIO        | Twilio node (`AccountSID:AuthToken`) |
| RESEND        | Resend node (API key) |
| SENDGRID      | SendGrid node (API key) |
| GITHUB        | GitHub node (personal access token) |
| AIRTABLE      | Airtable node (personal access token) |
| JIRA          | Jira node (`email:api-token`) |
| HUBSPOT       | HubSpot node (private app access token) |
| SALESFORCE    | Salesforce node ("Connect Salesforce", production or sandbox) |
| POSTGRES      | Postgres node (connection string) |
| MYSQL         | MySQL node (`mysql://user:password@host:3306/database`) |
| SSH           | SSH node (host, port, username, and a private key or password; optional host key fingerprint) |
| HTTP_HEADER_AUTH / HTTP_BEARER_AUTH / HTTP_BASIC_AUTH | HTTP Request and MCP Client nodes |

## Security

* **Outbound requests:** URLs and database hosts typed in by users cannot point at private or local addresses (SSRF guard, including redirects and DNS tricks). Set `ALLOW_PRIVATE_NETWORK_REQUESTS=true` on a self-hosted server that needs to reach its own network, for example Ollama.
* **Webhooks:** per-node secrets or provider signatures (Stripe, WhatsApp, Typeform, Telegram), and a per-workflow rate limit.
* **Duplicate deliveries:** an event a provider sends twice starts one run, not two (see below).
* **Webhook responses** are served with a sandbox policy so a workflow cannot run scripts on the app's origin.
* **Sign-in:** email verification for password sign-ups, password reset by email, Google and GitHub sign-in.
* **Sandboxed code:** the Code node and `{{ $json }}` expressions run in QuickJS with no access to Node, the network or the filesystem.
* **SSH:** the server address is part of the credential, so a saved key can only be used against that server. Private and local addresses are refused, a command has a time limit (30 seconds, up to 120) and an output limit, and the node is not unlocked by the free trial. Use `{{shellQuote value}}` for anything that comes from outside the workflow, such as webhook data, so it cannot be read as extra commands.

---

# 🔌 Public API

Create a key under **API Keys** (Pro plan or free trial) and send it as `Authorization: Bearer <key>` or `X-API-Key: <key>`.

| Endpoint | Description |
| -------- | ----------- |
| `GET /api/v1/workflows` | List your workflows |
| `POST /api/v1/workflows/:id/execute` | Run a workflow from its manual trigger; the JSON body becomes the run's variables |
| `GET /api/v1/executions/:id` | Status and, once finished, the output |
| `GET /api/v1/executions?workflowId=...` | Recent executions |
| `POST /api/v1/executions/:id/retry` | Run an execution again with the same starting data |

```bash
curl -X POST "$APP_URL/api/v1/workflows/<workflowId>/execute" \
  -H "Authorization: Bearer <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"customer":"Ali"}'
```

---

* **SQL injection:** in the Postgres and MySQL nodes, values belong in **Query Parameters** (a JSON array, one value per `$1` or `?`), which accepts expressions such as `["{{webhook.body.email}}"]` and never mixes them into the SQL. An "Execute Query" whose query text contains a `{{ }}` expression shows a warning in the editor and is refused when the workflow runs, unless the node's **Allow expressions in query text (unsafe)** option is on (off by default). Nodes that already had expressions in their query before this rule keep working: the migration switches the option on for them.
# 💳 SaaS Billing & Subscription System

RXJ includes a complete SaaS monetization architecture powered by Polar.

## SaaS Features

* Automatic 7-day free trial user allocation upon signup
* Dynamic plan detection and runtime casting via Prisma Enums
* Usage-based monetization
* Workflow usage tracking
* Execution usage tracking
* Credential usage limits
* Plan-locked nodes (scheduling, Google Sheets, Gmail, AI Agent, WhatsApp, SSH) and API access. The free trial unlocks all of them except SSH
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
* Workflow templates (see below)
* Guided product introduction
* Trial onboarding flow with proactive expiration countdowns

## Workflow templates

The **Templates** page is a gallery of ready-made workflows. "Use template" copies one into the user's account as a new workflow, which opens with its nodes marked "Not Configured" wherever the user has to connect their own account.

* **Publishing:** an admin builds a workflow, then picks it under **New template** and gives it a name, description, category and the plan it is available from. Editing a template can replace its content with the current version of a workflow; hidden templates are visible to admins only.
* **Admins** are the email addresses in the `ADMIN_EMAILS` environment variable. Only they can publish, edit and delete templates.
* **What a template never contains:** stored credentials, webhook and signing secrets, WhatsApp verify tokens and app secrets, Slack and Discord webhook URLs, and the workflow an Execute Workflow node pointed at. Anything typed into ordinary fields (a key pasted into a header, a prompt) is copied as it is, so check the workflow before publishing.
* **Plans:** each template has a minimum plan. Locked templates are shown with a lock and offer the upgrade. An active free trial opens every template, the same way it opens plan-locked nodes.
* Using a template counts toward the plan's workflow limit, and workflows already made from a template do not change when the template is edited or deleted.

## Planned Improvements

* Interactive onboarding checklist
* Guided node setup
* AI workflow generation
* Template marketplace

---

# 🧰 Setup

```bash
npm install
npx prisma migrate deploy   # apply the database migrations
npm run dev:all             # Next.js + Inngest dev server + ngrok
```

Run the checks that need no database or external service:

```bash
npx tsx --conditions=react-server src/inngest/__test__/testCoreNodes.ts
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
```

## Environment variables

| Variable | Purpose |
| -------- | ------- |
| `DATABASE_URL` | PostgreSQL connection string |
| `ENCRYPTION_KEY` | Encrypts stored credentials |
| `NEXT_PUBLIC_APP_URL` | Public address of the app; used for webhook URLs, OAuth redirects and trusted origins |
| `TRUSTED_ORIGINS` | Extra origins allowed to sign in, comma-separated |
| `ADMIN_EMAILS` | Who may publish, edit and delete workflow templates, comma-separated |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in and the "Google account" credential. Add `<app URL>/api/oauth/google/callback` as an authorised redirect URI |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | GitHub sign-in |
| `SALESFORCE_CLIENT_ID`, `SALESFORCE_CLIENT_SECRET` | The Salesforce connected app behind "Connect Salesforce". Its callback URL is `<app URL>/api/oauth/salesforce/callback`, with the `api` and `refresh_token, offline_access` scopes |
| `RESEND_API_KEY` | Sends verification and password-reset emails. Email verification is only required when this is set |
| `EMAIL_FROM` | Sender of those emails; must be on a domain verified in Resend |
| `REQUIRE_EMAIL_VERIFICATION` | Set to `false` to switch verification off |
| `POLAR_*` | Billing (access token, product IDs, webhook secret, success URL) |
| `ALLOW_PRIVATE_NETWORK_REQUESTS` | `true` lets workflows reach private addresses (self-hosting only) |
| `WEBHOOK_RATE_LIMIT_PER_MINUTE`, `API_RATE_LIMIT_PER_MINUTE` | Request limits, default 120 |
| `WEBHOOK_RESPONSE_TIMEOUT_MS` | How long a webhook waits for the workflow's response, default 25000 |
| `MAX_ITEMS_PER_NODE` | Items one node may process in a list, default 100 |
| `MAX_FILE_SIZE_MB`, `MAX_USER_STORAGE_MB`, `FILE_RETENTION_DAYS` | Workflow file limits, defaults 10, 200 and 7 |
| `TELEGRAM_PROXY` | Optional proxy for calls to the Telegram API |
| `NGROK_URL` | Tunnel domain for local development |

---

# 🗺️ Node Roadmap (Planned)

Nodes that are not built yet. Each new integration is a config passed to `createIntegrationNode` plus an executor; see `src/features/executions/components/apps` for the pattern.

| Node | What it needs |
| ---- | ------------- |
| Google Docs | Creating and editing documents (Drive can already download them as PDF) |
| More PDF scripts | Chinese, Japanese, Korean, Devanagari and emoji have no bundled font and are rejected; Urdu is drawn in Naskh style, not Nastaliq |
| Scanned PDFs and old Office files | Extract from File cannot read scanned PDFs (that needs OCR) or the old .xls and .doc formats |
| Browser Automation | Deliberately not built: it needs a headless browser service that cannot run on standard serverless functions, and it is easy to abuse. If added, the plan is a node that uses the user's own hosted-browser API key |
| MongoDB, Redis, Supabase (REST) | More data stores next to Postgres and MySQL |
| Slack / Discord bots | Bot-token nodes and triggers; today both send through webhook URLs |
| Wait (resume on webhook) | Pausing a run until an external call |

Also not built: a true n8n items model for every node from the trigger onward (items start at a list node), pgvector for the Vector Store, and the stdio / SSE transports for MCP.

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
* Resend (account emails)
* QuickJS (sandboxed code and expressions)
* fast-xml-parser (RSS and Atom feeds), mysql2 (MySQL node), ssh2 (SSH node)
* pdf-lib, fontkit and bidi-js (PDF Generator), unpdf, mammoth and exceljs (reading PDF, Word and Excel files)
* Noto Sans and Noto Naskh Arabic fonts (SIL Open Font License), bundled in `assets/fonts`

---

## AI SDKs

* Vercel AI SDK (Agent Orchestration & Tool Calling)
* OpenAI, Anthropic and Google Gemini providers for the Vercel AI SDK

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
tRPC API Layer            Public API (/api/v1)        Webhook routes
   ↓                            ↓                          ↓
Prisma ORM  ←──────────────────────────────────────────────┘
   ↓
Neon PostgreSQL

Workflow Execution Engine
   ↓
Inngest Background Jobs & Cron Heartbeats
   ↓
Node Executors
   ↓
External APIs / AI Providers / Messaging Services
```
