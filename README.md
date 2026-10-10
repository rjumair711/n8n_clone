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

* **Chat Model (required):** connect an OpenAI, Anthropic, Gemini, DeepSeek, Kimi, Qwen or Chat Model node to the Chat Model port; its credential and model are used.
* **Parser (optional):** a Structured Output Parser makes the agent answer with JSON in a structure you define; `{{output}}` becomes an object.
* **Memory (optional):** a Buffer Memory node keeps the last N messages per session and replays them as real chat turns.
* **Tools (optional):** any node connected to the Tools port becomes a tool. Give each one a name and description in the agent's settings. An MCP Client node adds all the tools of an MCP server; an Execute Workflow node makes another workflow a tool; a Vector Store node lets the agent search your documents.
* **`{{$fromAI "name" "description"}}`:** write this in any field of a tool node to let the agent fill in that value.
* **Prompt source:** taken from the trigger (`{{chatInput}}`, set by the Chat, Telegram and WhatsApp triggers) or defined in the node with `{{variables}}`.
* **Options:** System Message, Max Iterations (default 10), Max Tool Calls (default 25), Allow dangerous tools (off), Return Intermediate Steps.

### Tool safety (prompt injection)

The model decides which tools to call, and it acts on text it has read: a chat message, an email, a web page. That text can try to give it orders. These limits apply to every agent:

* **Risk levels:** each connected tool is shown as Read, Write or Dangerous in the agent's settings.

  | Level | What it covers |
  | ----- | -------------- |
  | Read | Searching, getting and listing; Vector Store search; HTTP `GET`; calculations and text nodes |
  | Write | Sending a message; creating or updating a record; HTTP `POST`/`PUT`/`PATCH`; MCP Client; anything not known to be harmless |
  | Dangerous | SSH; raw SQL (Postgres and MySQL "Execute Query"); every delete operation and HTTP `DELETE`; Execute Workflow |

* **Dangerous tools are off by default.** With one connected and **Allow dangerous tools** unchecked, the run fails at the agent with a message naming the tool. Agents saved before this option existed count as unchecked, so a workflow that already uses such a tool needs the option switched on once.
* **Max Tool Calls** limits how many tool calls one run may make in total. The run fails with a clear error when the model asks for more.
* **SSH as a tool:** every `$fromAI` text value in the command is quoted for the shell automatically (inside `'...'`, `"..."` and `$( )` too), so it always arrives as one argument. A value placed inside backticks, `$(( ))`, a `#` comment, `$'...'` or after a heredoc cannot be quoted safely and fails the run.
* **Tool results are data:** the system message tells the model that tool results are untrusted data and never instructions, and each result is handed to the model inside a marked `<tool_result>` block.

These limits reduce the risk; they do not remove it. Give an agent only the tools and credentials it needs.
* **Output:** `{{output}}` and `{{<variableName>.output}}`, plus `intermediateSteps` when enabled.
* **Chat panel:** workflows with a Chat Trigger get an "Open chat" button in the editor to talk to the agent.

## Model nodes

| Node | Description |
| ---- | ----------- |
| OpenAI | GPT models with dynamic prompts |
| Anthropic | Claude models (default `claude-sonnet-5-5`) |
| Gemini | Google Gemini models |
| DeepSeek | DeepSeek models (default `deepseek-chat`) |
| Kimi | Moonshot AI's Kimi models (default `moonshot-v1-8k`), international or China region |
| Qwen | Alibaba Cloud's Qwen models (default `qwen-plus`), international or China region |
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

**Download links.** The `url` of a file reference is a signed link, `/api/files/<id>?expires=...&signature=...`. It works for 15 minutes for anyone who has it, without signing in, so a workflow can hand a file to another service. After that it answers `403`; the signed-in owner can still open it, and every node that loads the file gets a fresh link. Files are always sent as downloads (`Content-Disposition: attachment`), with their stored type and `X-Content-Type-Options: nosniff`, so a file a workflow made is never shown as a page of the app.

**Limits when reading files** (Extract from File). A file over a limit fails the node with a message that says which one:

| File | Limit | Setting |
| ---- | ----- | ------- |
| Excel (XLSX), Word (DOCX) | Unpacks to at most 50 MB, and has at most 2,000 parts. Checked by unpacking with a cap before the file is opened, so a "zip bomb" is refused | `MAX_UNCOMPRESSED_FILE_MB`, `MAX_ZIP_ENTRIES` |
| PDF | The first 200 pages are read (`<name>.truncated` is true when there were more; `<name>.pages` is the real count), within 20 seconds | `PDF_MAX_PAGES`, `PDF_EXTRACT_TIMEOUT_SECONDS` |
| CSV | At most 10,000 rows; the node's **Max Rows** field can lower it. `<name>.truncated` is true when the file had more | `CSV_MAX_ROWS` |
| Excel (XLSX) | The first 5,000 rows of the sheet | |

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
| DEEPSEEK      | DeepSeek node |
| KIMI          | Kimi node     |
| QWEN          | Qwen node     |
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

* **Outbound requests:** URLs, database hosts and SSH hosts typed in by users cannot point at private or local addresses (SSRF guard, including redirects and DNS tricks). A self-hosted server that needs to reach something on its own network, for example Ollama, lists exactly that in `PRIVATE_NETWORK_ALLOWLIST`:

  ```
  PRIVATE_NETWORK_ALLOWLIST=127.0.0.1:11434,10.0.0.0/24,db.internal:5432
  ```

  | Entry | Allows |
  | ----- | ------ |
  | `127.0.0.1:11434` | that address on that port only |
  | `10.0.0.5` | that address on any port |
  | `10.0.0.0/24` | every address of the range, on any port |
  | `ollama.lan:11434`, `db.internal` | that host name (with or without a port), whatever private address it resolves to |
  | `[::1]:11434`, `fd00:1234::/64` | the same for IPv6; an address with a port goes in brackets |

  * Everything private that is not listed stays refused, cloud metadata (`169.254.169.254`) included.
  * A request has to match by what it uses: `http://localhost:11434` is allowed by `localhost:11434`, not by `127.0.0.1:11434`, because `localhost` can also resolve to `::1` and every address of a name has to be allowed. Use the same form in the node as in the list. The Chat Model node's default Ollama address is `http://localhost:11434/v1`, so for that the entry is `localhost:11434`.
  * A range with a port (`10.0.0.0/24:5432`) is not supported. Entries that cannot be read are ignored and named in a warning at startup.
  * `ALLOW_PRIVATE_NETWORK_REQUESTS=true` still works and opens **every** private address; the allowlist then has no effect. It logs a warning at startup recommending the allowlist, which is the safer choice.
* **Webhooks:** per-node secrets or provider signatures (Stripe, WhatsApp, Typeform, Telegram), and a per-workflow rate limit.
* **Duplicate deliveries:** an event a provider sends twice starts one run, not two (see below).
* **Webhook responses** are served with a sandbox policy so a workflow cannot run scripts on the app's origin.
* **Sign-in:** email verification for password sign-ups, password reset by email, Google and GitHub sign-in.
* **Sandboxed code:** the Code node and `{{ $json }}` expressions run in QuickJS with no access to Node, the network or the filesystem. Every run gets an engine of its own with these limits; going over one fails that node with a message that says which:
  * **Memory:** 64 MB. Each Code node run has a WebAssembly memory of its own that cannot grow past that, and gives all of it back when the run ends; expressions share one such engine. (QuickJS's built-in limit alone only refuses a single allocation over the limit, not many small ones.)
  * **Call depth:** a 128 KB stack, about 700 nested calls, so endless recursion ends as a "stack overflow" error.
  * **Time:** a Code node is stopped after its **Timeout (seconds)** setting, 10 by default and 60 at most; one expression after 1 second.
  * **Result size:** the JSON a Code node returns, and the result of one expression, may be 1 MB at most (`SANDBOX_MAX_OUTPUT_KB`). A Code node keeps at most 200 `console.log` lines of 10,000 characters each.
  * The engine runs on the server's main thread, so a script that uses its whole timeout holds up other requests on that server for that long. Keep the timeout low unless a script really needs it.
* **Credentials** are encrypted with AES-256-GCM and never sent to the browser; the key can be changed without losing them (see "Credential encryption and key rotation").
* **Files:** download links are signed and expire after 15 minutes; files are always sent as attachments with `nosniff`; XLSX, DOCX, PDF and CSV files are checked against size, page, time and row limits before or while they are read (see "Files").
* **Tenant isolation:** every workflow, execution, credential, file and API key belongs to one account. Anything that loads one of them by id goes through a single check, `assertOwnership` in `src/lib/ownership.ts`: a record that belongs to someone else gets the same `404` "not found" as one that does not exist, in the app, in `/api/v1` and on file download links. `scripts/test-tenant-isolation.ts` tries every such route as a second user (see `docs/TESTING.md`, T11d).
* **Execution logs:** credential values and common secret shapes are replaced with `[REDACTED]` before node input, output and errors are stored or sent to Sentry; execution data is deleted after 7, 30 or 90 days; a workflow can be set not to save node data at all (see "Execution logs: redaction and retention").
* **SQL injection:** in the Postgres and MySQL nodes, values belong in **Query Parameters** (a JSON array, one value per `$1` or `?`), which accepts expressions such as `["{{webhook.body.email}}"]` and never mixes them into the SQL. An "Execute Query" whose query text contains a `{{ }}` expression shows a warning in the editor and is refused when the workflow runs, unless the node's **Allow expressions in query text (unsafe)** option is on (off by default). Nodes that already had expressions in their query before this rule keep working: the migration switches the option on for them.
* **SSH:** the server address is part of the credential, so a saved key can only be used against that server. Private and local addresses are refused, a command has a time limit (30 seconds, up to 120) and an output limit, and the node is not unlocked by the free trial. Use `{{shellQuote value}}` for anything that comes from outside the workflow, such as webhook data, so it cannot be read as extra commands.

---

## Execution logs: redaction and retention

**Redaction.** A run always works with the real data. What is *stored* about it is redacted first, with `[REDACTED]` in place of each secret:

| Stored | What is redacted |
| ------ | ---------------- |
| Each node's input, output, error and stack trace; the execution's error | The values of all your credentials (also inside a longer text, such as a URL or an error message), and the well-known shapes below |
| The execution's final output | Credential values only. This is also what a webhook that answers "when the last node finishes", the chat panel and `GET /api/v1/executions/:id` return, so a token a workflow made on purpose is not changed |
| The data the run started with (kept for Retry) | Nothing: a retry has to start from the same data |

The well-known shapes: `sk-...` keys, `AKIA...` AWS key ids, Slack `xoxb-`/`xoxp-`/`xoxa-` tokens, GitHub `ghp_...` tokens, JSON Web Tokens, `Bearer ...` tokens, the values of `Authorization`, `Proxy-Authorization`, `Cookie`, `Set-Cookie` and `X-API-Key` headers, and the password in connection strings like `postgresql://user:password@host`. Credential values shorter than 6 characters are not matched, and for credentials with several fields (SMTP, SSH, Google, Salesforce) the host, username and similar fields are left readable.

The same redaction of well-known shapes runs on everything sent to Sentry (errors, traces and logs).

**Retention.** On the **Executions** page, **Execution data retention** sets how long your execution data is kept: 7, 30 (default) or 90 days. A nightly job deletes older executions with their node data. An execution from the current month keeps its row (status, times and error message) until the month ends, because the monthly execution limit counts it; everything else about it is deleted. Running executions are not touched.

**Don't save node input/output.** In the editor, the gear button next to the Active switch has this workflow setting (off by default). When it is on, runs of that workflow store only their status, times and errors (redacted as above). Such runs cannot be retried, the execution page shows no data for them, and a webhook that answers "when the last node finishes" returns an empty object; use a Respond to Webhook node instead.

## Credential encryption and key rotation

Everything a credential holds (an API key, a login, or the OAuth tokens of a connected Google or Salesforce account) is stored encrypted in `Credential.value`. It is decrypted only on the server, at the moment a node needs it. The browser never receives it, encrypted or not: the Credentials pages get the name, type and dates, and the edit form only says that a secret is saved. Leaving the secret empty when editing keeps the saved one.

**Format**

```
v1:<base64 of  IV (12 bytes) | auth tag (16 bytes) | ciphertext>
```

* Cipher: AES-256-GCM. The IV is random for every value, and the auth tag makes a changed or damaged value fail to decrypt instead of giving a wrong secret.
* Key: 256 bits, derived from `ENCRYPTION_KEY` with scrypt. Use a long random value, for example `openssl rand -base64 32`.
* `v1:` is the format version, so the format can change later without guessing.
* Values saved before this format (written by the `cryptr` package: hex text, no prefix, AES-256-GCM with a 16-byte IV) are still read. The rotation script rewrites them as `v1:`; run it once after upgrading, without changing any key, to convert them.

**Changing the key**

1. Back up the database.
2. Set `ENCRYPTION_KEY_PREVIOUS` to the current key and `ENCRYPTION_KEY` to the new one, and deploy or restart. From now on new values are written with the new key, and old values are still read with the previous one, so nothing stops working.
3. See what the script would do: `npx tsx scripts/rotate-encryption-key.ts --dry-run`
4. Run it: `npx tsx scripts/rotate-encryption-key.ts` (or `npm run rotate-encryption-key`). It goes through the credentials 100 at a time and re-encrypts each with the new key. Values that are already current are skipped, so it can be stopped and run again. A credential a user saves while it runs is not overwritten.
5. When it ends with "Every credential is encrypted with the current key", activate every workflow that has a **Telegram Trigger** once more (switch it off and on). Telegram's webhook secret is derived from the key; the old one is only accepted while `ENCRYPTION_KEY_PREVIOUS` is set.
6. Remove `ENCRYPTION_KEY_PREVIOUS` and deploy or restart.

If the script lists credentials that "could not be read", they were written with a key that is neither of the two: check `ENCRYPTION_KEY_PREVIOUS`, and keep it set until the list is empty. The script prints credential ids only, never values, and exits with code 1 in that case.

The script must run with the same `ENCRYPTION_KEY`, `ENCRYPTION_KEY_PREVIOUS` and `DATABASE_URL` as the app. It reads `.env` when there is one.

---

# 🔌 Public API

Create a key under **API Keys** (Pro plan or free trial) and send it as `Authorization: Bearer <key>` or `X-API-Key: <key>`.

| Endpoint | Scope | Description |
| -------- | ----- | ----------- |
| `GET /api/v1/workflows` | `workflows:read` | List your workflows |
| `POST /api/v1/workflows/:id/execute` | `workflows:execute` | Run a workflow from its manual trigger; the JSON body becomes the run's variables |
| `GET /api/v1/executions/:id` | `executions:read` | Status and, once finished, the output |
| `GET /api/v1/executions?workflowId=...` | `executions:read` | Recent executions |
| `POST /api/v1/executions/:id/retry` | `executions:retry` | Run an execution again with the same starting data |

**API keys**

* The full key is shown once, when it is created. Only its SHA-256 hash and a short prefix (`rxj_ab12cd…`) are stored, so a key cannot be read back from the app or the database.
* Each key has **scopes** and an optional **expiry date** (the key works until the end of that day, UTC). A request to a route whose scope the key lacks gets `403` with the name of the missing scope; an expired, revoked or unknown key gets `401`.
* Each key may make `API_RATE_LIMIT_PER_MINUTE` requests per minute (default 120); after that it gets `429` with a `Retry-After` header.
* The **API Keys** page lists every key with its prefix, scopes, created, last used and expiry, and a **Revoke** button that stops the key at once.
* Keys created before scopes existed keep every scope and have no expiry.

```bash
curl -X POST "$APP_URL/api/v1/workflows/<workflowId>/execute" \
  -H "Authorization: Bearer <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"customer":"Ali"}'
```

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
* **Admins** are accounts whose email is in the `ADMIN_EMAILS` environment variable **and** is verified. Only they can publish, edit and delete templates. A Google or GitHub sign-in counts as verified; a password account has to confirm its email first, which needs `RESEND_API_KEY`. Without that key the server logs a warning at startup, and a password account using an admin address stays an ordinary user.
* **Admins need two-factor authentication.** Publishing, editing and deleting templates is refused until the admin turns it on under **Settings**; until then the Templates page shows a note with a link there instead of the admin buttons.
* **What a template never contains:** stored credentials, webhook and signing secrets, WhatsApp verify tokens and app secrets, Slack and Discord webhook URLs, and the workflow an Execute Workflow node pointed at. Anything typed into ordinary fields (a key pasted into a header, a prompt) is copied as it is.
* **Secret scan:** before a template is published or updated, every field of every node is scanned for the secret shapes the log redaction knows (`sk-` keys, Bearer tokens, JWTs, AWS, Slack and GitHub tokens, passwords in URLs) and for hand-typed values in `Authorization`, `Cookie` and `X-API-Key` headers. Values made only of `{{ }}` expressions pass. If anything is found the template is not saved and the dialog lists the node and field (never the value). An admin can tick **I checked this, publish anyway** to save it regardless. Editing only a template's details scans its stored content again. The scan knows those shapes only, so a secret of another shape still has to be caught by reading the workflow.
* **Plans:** each template has a minimum plan. Locked templates are shown with a lock and offer the upgrade. An active free trial opens every template, the same way it opens plan-locked nodes.
* Using a template counts toward the plan's workflow limit, and workflows already made from a template do not change when the template is edited or deleted.

## Account security

The **Settings** page (sidebar) holds two things.

* **Two-factor authentication.** Turning it on shows a QR code for an authenticator app (TOTP) and ten backup codes, and asks for a first code before it takes effect. From then on a password sign-in also asks for a code on `/two-factor`; a backup code works once in its place, and "Do not ask on this device for 30 days" skips the question on that browser. New backup codes can be made, and it can be turned off, after confirming the password. Accounts that only sign in with Google or GitHub have no password to confirm with and are not asked for a code at sign-in: for them the provider's own two-factor is what protects the sign-in.
* **Active sessions.** Every signed-in browser with its device, IP address and when it was last active, with **Sign out** for one and **Sign out all other sessions**. "Last active" is when Better Auth last refreshed the session, which it does about once a day, not the last click.
* **Sign-in lockout.** Ten wrong passwords for one account within 15 minutes lock password sign-in for that account for 15 minutes, whatever addresses the attempts came from. The answer is the same for addresses that have no account. The lock ends by itself after the 15 minutes, and a correct password then starts the count again; resetting the password does not lift it early. Google and GitHub sign-in are not affected. Anyone who knows an address can lock its password sign-in this way, which is the price of the rule.
* **Sign-in rate limit.** Password and two-factor code attempts are limited per IP address (`SIGN_IN_RATE_LIMIT_PER_MINUTE`, default 20). The address is read from the proxy headers Better Auth trusts (`x-forwarded-for`), so the app has to run behind a proxy that sets it, as it does on Vercel.
* **Passkeys** are not included: in the installed Better Auth (1.6) they are a separate package, `@better-auth/passkey`, which is not installed.

## Limits against abuse

A free trial unlocks the paid nodes, so these keep a trial or a cheap plan from being used to send in bulk or to sign up over and over.

* **Daily message caps.** Each user may send this many messages per day (the day is UTC) through the nodes that reach people outside the app. The numbers are in one file, `src/config/message-caps.ts`.

  | Plan | Email (SMTP, Gmail, Resend, SendGrid) | WhatsApp | Twilio (SMS and WhatsApp) | Telegram |
  | ---- | ----- | -------- | ------ | -------- |
  | Free (and the free trial) | 20 | 20 | 10 | 50 |
  | Beginner | 100 | 50 | 25 | 200 |
  | Intermediate | 1,000 | 500 | 250 | 2,000 |
  | Pro | 10,000 | 5,000 | 2,500 | 20,000 |

  * For email every recipient counts (To, Cc and Bcc), so one email to 30 addresses is 30. The four email nodes share one count.
  * Reading mail with the Gmail node does not count; sending and replying do.
  * The cap is the plan's, trial or not, and it holds wherever the node runs: in a workflow, once per item of a list, and as an AI Agent tool.
  * When a send would go over, the node fails before anything is sent, with for example "Daily email limit reached: the Free plan allows 20 emails per day and 20 were sent today. The count starts again at 00:00 UTC. Upgrade your plan to send more."
  * A message is counted when the node is about to send it, so one the provider then refuses still counts.
* **Disposable email addresses** (mailinator, 10minutemail and the like, and their subdomains) cannot be used to sign up, with a password or through Google or GitHub. The list comes from the `disposable-email-domains-js` package; `npm update disposable-email-domains-js` brings in new domains. Accounts that already exist are not affected.
* **Cloudflare Turnstile** on the password sign-up form, when `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are both set. Without them (or with only one, which logs a warning at startup) sign-up works as before. Google and GitHub sign-ups are not asked: the provider has checked them.

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

Step-by-step workflows for testing every node by hand are in [`docs/TESTING.md`](docs/TESTING.md).

## Environment variables

| Variable | Purpose |
| -------- | ------- |
| `DATABASE_URL` | PostgreSQL connection string |
| `ENCRYPTION_KEY` | Encrypts stored credentials and OAuth tokens. A long random value |
| `ENCRYPTION_KEY_PREVIOUS` | Only while changing `ENCRYPTION_KEY`: the old key, so values written with it can still be read. See "Credential encryption and key rotation" |
| `NEXT_PUBLIC_APP_URL` | Public address of the app; used for webhook URLs, OAuth redirects and trusted origins |
| `TRUSTED_ORIGINS` | Extra origins allowed to sign in, comma-separated |
| `ADMIN_EMAILS` | Who may publish, edit and delete workflow templates, comma-separated. The account's email must also be verified |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in and the "Google account" credential. Add `<app URL>/api/oauth/google/callback` as an authorised redirect URI |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | GitHub sign-in |
| `SALESFORCE_CLIENT_ID`, `SALESFORCE_CLIENT_SECRET` | The Salesforce connected app behind "Connect Salesforce". Its callback URL is `<app URL>/api/oauth/salesforce/callback`, with the `api` and `refresh_token, offline_access` scopes |
| `RESEND_API_KEY` | Sends verification and password-reset emails. Email verification is only required when this is set |
| `EMAIL_FROM` | Sender of those emails; must be on a domain verified in Resend |
| `REQUIRE_EMAIL_VERIFICATION` | Set to `false` to switch verification off |
| `POLAR_*` | Billing (access token, product IDs, webhook secret, success URL) |
| `PRIVATE_NETWORK_ALLOWLIST` | The private addresses workflows may reach, comma-separated: hosts, `host:port` or CIDR ranges, e.g. `127.0.0.1:11434,10.0.0.0/24` (self-hosting only) |
| `ALLOW_PRIVATE_NETWORK_REQUESTS` | `true` lets workflows reach every private address. Still works, but logs a warning: prefer `PRIVATE_NETWORK_ALLOWLIST` |
| `WEBHOOK_RATE_LIMIT_PER_MINUTE`, `API_RATE_LIMIT_PER_MINUTE` | Requests per minute for one workflow's webhook URL, and for one API key. Default 120 each |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile on the sign-up form. Both or neither: with neither the check is off |
| `SIGN_IN_RATE_LIMIT_PER_MINUTE` | Password and two-factor code attempts per minute from one IP address, default 20 |
| `WEBHOOK_RESPONSE_TIMEOUT_MS` | How long a webhook waits for the workflow's response, default 25000 |
| `SANDBOX_MAX_OUTPUT_KB` | The most a Code node or one expression may return, in KB, default 1024 |
| `MAX_ITEMS_PER_NODE` | Items one node may process in a list, default 100 |
| `MAX_FILE_SIZE_MB`, `MAX_USER_STORAGE_MB`, `FILE_RETENTION_DAYS` | Workflow file limits, defaults 10, 200 and 7 |
| `MAX_UNCOMPRESSED_FILE_MB`, `MAX_ZIP_ENTRIES` | What an XLSX or DOCX file may unpack to, defaults 50 and 2000 |
| `PDF_MAX_PAGES`, `PDF_EXTRACT_TIMEOUT_SECONDS` | Pages read from a PDF and the time allowed, defaults 200 and 20 |
| `CSV_MAX_ROWS` | Most rows read from a CSV file, default 10000 |
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
