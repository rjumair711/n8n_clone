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
* Wait node: pause a run for a time, until a date, or until its resume URL is called (see "Waiting executions")
* Human approval: AI Agent tools that wait for a person's Approve or Reject, and a Send and Wait for Approval node
* Hosted forms: a Form Trigger with its own public page, multi-step forms with the Form node, and a Wait node that resumes on a form
* Website chat widget: a public Chat Trigger with an embed snippet, a hosted chat page, per-visitor memory and a handoff to a person
* OCR and vision: an Analyze Image / Document node that reads images and PDFs, scanned ones too, with a vision model
* Web Search and Read Web Page nodes, usable as AI Agent tools
* Audio: Transcribe Audio and Text to Speech nodes, and voice messages from the Telegram and WhatsApp triggers
* Inngest background execution system
* Dynamic time-based execution engine via an automated Background Ticker (`* * * * *` clock matching system)
* Shared execution context
* Dynamic `{{variable}}` interpolation using Handlebars, plus n8n-style `{{ $json.field }}` expressions
* Execution persistence in PostgreSQL
* Realtime execution updates
* Retry handling and failure propagation
* Waiting executions can be cancelled

## Waiting executions

The **Wait** node pauses a run and continues it later. While it is paused nothing runs and no request is held open: the pause is an Inngest `step.sleepUntil` or `step.waitForEvent`, and the execution has the status **Waiting**.

| Resume | The run continues |
| ------ | ----------------- |
| After Time Interval | after an amount of seconds, minutes, hours or days |
| At Specified Time | at a date and time (ISO, e.g. `2026-12-24T09:00:00Z`; no time zone means UTC). A time in the past does not wait |
| On Webhook Call | when the execution's resume URL is called (GET, POST, PUT or PATCH) |
| On Form Submitted | when the form at `{{execution.formUrl}}` is submitted (see "Forms"). The answers are at `{{wait.form.<field>}}` |

* **Resume URL.** Every execution has its own: `<app>/api/webhooks/wait/<executionId>/<token>`. The token is an HMAC of the execution id made with `ENCRYPTION_KEY`, so the URL cannot be guessed and nothing is stored for it. It is available from the first node on as `{{execution.resumeUrl}}` (or `{{ $execution.resumeUrl }}`), so a node before the Wait node can send it out, for example as an approval link in an email. Whoever has the URL can continue that one execution, so send it only to who should decide.
* **What the call sent** is under the Wait node's variable (default `wait`): `{{wait.body}}`, `{{wait.query}}`, `{{wait.headers}}`, `{{wait.method}}`, and `{{wait.resumedBy}}` (`webhook`, `timeout` or `timer`).
* **Timeout.** On Webhook Call takes an optional timeout and what to do when nobody called in time: **Continue the workflow** (`{{wait.timedOut}}` is true) or **Fail the workflow**. Without a timeout it waits the longest the server allows.
* **Longest wait.** 7 days, which is the most Inngest's free plan can sleep. Set `WAIT_MAX_DAYS` on a plan that allows more.
* **Cancel.** A waiting execution has a **Cancel** button on its page. It is marked Failed with "Cancelled by the user while it was waiting", the Inngest run is stopped, and the nodes after the Wait node never run. The page also shows when the wait ends and, for On Webhook Call, the resume URL.
* The resume URL answers `409` while the execution is not waiting for a call (it has not reached the Wait node yet, was already resumed, or has finished) and `404` for a wrong token. One URL serves every Wait node of the execution, one call per wait.
* The token is replaced by `[REDACTED]` in stored node input and output, and "All Workflow Data" webhook responses leave the URL out.
* A link opened by a mail scanner or a link preview counts as a call. For approvals that matter, link to a page or form that sends a POST instead.
* Waiting executions are not removed by the retention cleanup, cannot be run again until they finish or are cancelled, and a Wait node cannot be an AI Agent tool. After a list node the Wait node pauses once for the whole list.

### Send and Wait for Approval

The **Send and Wait for Approval** node asks a person a yes/no question in a normal workflow and pauses until they answer. It sends a title and optional details with the same signed, single-use, expiring Approve / Reject links as the AI Agent's tool approvals (see "Human approval for tools"), through the same channels: the app's **Approvals** page, email, Slack, Telegram or WhatsApp.

* The run continues through the **Approved** or the **Rejected** output. Later nodes can also read `{{approval.approved}}`, `{{approval.decision}}` (`approved`, `rejected` or `expired`), `{{approval.timedOut}}` and `{{approval.decidedVia}}` (`link` or `app`).
* **Timeout** (default 24 hours, at most the longest wait) and **When Nobody Answers**: continue through Rejected, or fail the workflow.
* While it waits the execution is **Waiting** and can be cancelled. After a list node it asks once for the whole list.

## Forms

A workflow can have its own form: a public page hosted by the app, no sign-in needed.

* **Form Trigger.** Its settings show the **Form URL**, `<app>/forms/<id>` (the id is the trigger node's). The page works while the workflow is active. A submission starts the workflow with the answers at `{{form.<field>}}` and `{{formMeta.submittedAt}}`.
* **Fields:** Text, Email, Number, Dropdown, Date, File Upload and Checkbox, each with a label and a Required switch. A field's value is read by a name made from its label (`Your name` becomes `{{form.your_name}}`); the settings show it under each field.
* **Title, description, button label**, and **After Submit**: show a thank-you message, or redirect to a URL (http or https only).
* **Form node:** the next page of a multi-step form. Place it anywhere after the Form Trigger. When the run reaches it, the person who is filling in the form is shown that page next, and the workflow waits for it (the same Inngest wait-for-event as the Wait node: the execution is **Waiting**, and can be cancelled). Its title, description and messages can use earlier answers, for example `Hello {{form.your_name}}`. The answers are at `{{formPage.<field>}}`. The form ends with the After Submit setting of the last page that was submitted.
* **Wait node, On Form Submitted:** pauses a run of any workflow until a form is filled in. Send the link `{{execution.formUrl}}` from an earlier node (an email, a chat message). It is different for every execution, cannot be guessed, and is not the resume URL. The execution's page shows it while the run waits.
* **Uploaded files** are stored like every other workflow file: the same size limit per file (`MAX_FILE_SIZE_MB`), counted against the workflow owner's storage (`MAX_USER_STORAGE_MB`), removed after `FILE_RETENTION_DAYS`, and only ever downloaded as attachments. The value of a file field is a file variable: use `form.cv` in an email's Attachments, in Extract from File, and so on. Nothing is stored when the submission is not valid.
* **Checked on the server:** required fields, email and date formats, numbers, that a dropdown value is one of its options, and file sizes. Only the form's own fields are read; anything else that is sent is ignored.
* **Rate limit:** 30 submissions per minute per form (`FORM_RATE_LIMIT_PER_MINUTE`), counted before anything else is done.
* **CAPTCHA (optional):** the Form Trigger's "Require a CAPTCHA" switch adds a Cloudflare Turnstile check, verified on the server before any file is stored. It needs `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`; without both keys the form works without the check.
* A page of a running execution can be submitted once. A timeout on the Form node (default 1 hour) decides how long the page stays open, and whether the workflow fails or continues when nobody submits it.
* Limits: a form has at most 30 fields; a workflow that is switched off shows "This form is not available"; after a submission the page waits up to a minute for a next page before it shows the thank-you message.

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
| initial | Not run yet |
| loading | Executing, or paused at a Wait node |
| success | Completed |
| error   | Failed    |

An execution is Running, Waiting (paused at a Wait node), Success or Failed.

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

* **Chat Model (required):** connect an OpenAI, Anthropic, Gemini, DeepSeek, Kimi, Qwen or Chat Model node to the Chat Model port; its credential and model are used. A **Model Router** can be connected instead, to try a cheap model first (see below).
* **Parser (optional):** a Structured Output Parser makes the agent answer with JSON in a structure you define; `{{output}}` becomes an object.
* **Memory (optional):** a Buffer Memory node keeps the last N messages per session and replays them as real chat turns.
* **Tools (optional):** any node connected to the Tools port becomes a tool. Give each one a name and description in the agent's settings. An MCP Client node adds all the tools of an MCP server; an Execute Workflow node makes another workflow a tool; a Vector Store node lets the agent search your documents.
* **`{{$fromAI "name" "description"}}`:** write this in any field of a tool node to let the agent fill in that value.
* **Prompt source:** taken from the trigger (`{{chatInput}}`, set by the Chat, Telegram and WhatsApp triggers) or defined in the node with `{{variables}}`.
* **Options:** System Message, Max Iterations (default 10), Max Tool Calls (default 25), Allow dangerous tools (off), Require approval per tool (see "Human approval for tools"), Return Intermediate Steps.

### Tool safety (prompt injection)

The model decides which tools to call, and it acts on text it has read: a chat message, an email, a web page. That text can try to give it orders. These limits apply to every agent:

* **Risk levels:** each connected tool is shown as Read, Write or Dangerous in the agent's settings.

  | Level | What it covers |
  | ----- | -------------- |
  | Read | Searching, getting and listing; Vector Store search; HTTP `GET`; Web Search and Read Web Page; calculations and text nodes |
  | Write | Sending a message; creating or updating a record; HTTP `POST`/`PUT`/`PATCH`; MCP Client; anything not known to be harmless |
  | Dangerous | SSH; raw SQL (Postgres and MySQL "Execute Query"); every delete operation and HTTP `DELETE`; Execute Workflow |

* **Dangerous tools are off by default.** With one connected and **Allow dangerous tools** unchecked, the run fails at the agent with a message naming the tool. Agents saved before this option existed count as unchecked, so a workflow that already uses such a tool needs the option switched on once.
* **Max Tool Calls** limits how many tool calls one run may make in total. The run fails with a clear error when the model asks for more.
* **SSH as a tool:** every `$fromAI` text value in the command is quoted for the shell automatically (inside `'...'`, `"..."` and `$( )` too), so it always arrives as one argument. A value placed inside backticks, `$(( ))`, a `#` comment, `$'...'` or after a heredoc cannot be quoted safely and fails the run.
* **Tool results are data:** the system message tells the model that tool results are untrusted data and never instructions, and each result is handed to the model inside a marked `<tool_result>` block.

These limits reduce the risk; they do not remove it. Give an agent only the tools and credentials it needs.

### Human approval for tools

Each tool in the agent's settings has a **Require approval** switch. When the model calls such a tool, the tool is not run: the run pauses (the execution shows as **Waiting**, using the same Inngest wait-for-event as the Wait node), a request with the tool's name and its arguments is sent to a person, and the run continues with their answer.

* **Default.** On for Write and Dangerous tools, off for Read tools, on AI Agent nodes added to the canvas since this exists. An agent that was already in a workflow keeps running without approvals until a tool's switch is turned on, so nothing that works today starts waiting for a person.
* **Send approval requests through** (one setting per agent):

  | Channel | Needs |
  | ------- | ----- |
  | In the app | nothing: the request appears on the **Approvals** page and on the execution's page |
  | Email | an SMTP credential and the address to ask |
  | Slack | an incoming webhook URL |
  | Telegram | a Telegram bot credential and the chat ID |
  | WhatsApp | a WhatsApp credential, the Phone Number ID and the number to ask. WhatsApp only delivers free text to someone who wrote to that number in the last 24 hours |

  Whatever the channel, the workflow's owner can also answer on the Approvals page.
* **Approve / Reject links.** `<app>/api/approvals/<id>?decision=...&expires=...&signature=...`. The signature (HMAC with `ENCRYPTION_KEY`) covers the request, the decision and the expiry, so a Reject link cannot be changed into an Approve link. A link opens a page that shows the tool and its arguments and asks for a confirmation; only that button answers, so a mail scanner or link preview that opens the link approves nothing. A request is answered **once**, by whoever is first, and the links stop working when it **expires** (default 24 hours, set per agent).
* **Approved:** the tool runs with exactly the arguments that were shown, and the agent goes on with its result.
* **Rejected:** the tool is not run, the agent is told `The user rejected this action` and goes on (it usually says so in its answer). A request that expires is treated the same way, with a message saying nobody answered in time.
* Several calls that need approval in one turn are asked one after the other. Calls waiting for approval count toward Max Tool Calls. The tools of an MCP Client node share that node's switch.
* The tool's arguments are shown as plain text everywhere: they are never rendered as HTML or evaluated as a `{{template}}`.
* Cancelling a waiting execution withdraws its requests. If the request cannot be sent (a wrong credential, say), the run fails with that error instead of waiting.
* **Output:** `{{output}}` and `{{<variableName>.output}}`, plus `intermediateSteps` when enabled.
* **Chat panel:** workflows with a Chat Trigger get an "Open chat" button in the editor to talk to the agent.

### Website chat widget

Switch on **Make chat public** in the Chat Trigger's settings, save and activate the workflow, and anyone can chat with it:

* **Embed snippet:** `<script src="<app>/widget.js" data-id="<id>" async></script>`, shown in the settings to copy. It adds a floating chat button to a website; a click opens the chat window. On a phone the window fills the screen.
* **Hosted chat page:** `<app>/chat/<id>`, the same chat on a page of its own. The widget shows this page in a frame, so the website's styles and scripts cannot reach into the conversation.
* **Look:** title, colour, welcome message (shown first, not sent to the workflow) and an avatar (the https address of an image).
* **Urdu and Arabic:** the chat's direction is Automatic (from the title and welcome message), left to right, or right to left. Right to left mirrors the layout and puts the button on the left; every message is always shown in the direction of its own text.
* **One conversation per visitor.** A visitor's browser makes a session id and keeps it in its storage (when storage is blocked the chat still works until the page is closed). The workflow gets it as `{{sessionId}}`, in the form `widget:<id>:<visitor>`, so a Buffer Memory node remembers each visitor separately. A returning visitor sees their conversation again; **New chat** starts a fresh one.
* **Allowed domains:** a list of sites that may show the widget (`example.com`, `*.example.com`). Browsers refuse to frame the chat anywhere else, and `widget.js` shows no button there. Empty means any site. The hosted chat page itself is always reachable by its link.
* **Rate limits:** 60 messages per minute per widget (`CHAT_WIDGET_RATE_LIMIT_PER_MINUTE`) and 10 per minute per visitor (`CHAT_VISITOR_RATE_LIMIT_PER_MINUTE`), counted both by session id and by address.
* **Answers are not streamed.** The agent's answer is produced in a background run, so the chat shows a typing indicator and then the whole answer. Only the agent's answer (`output`) is ever sent to the visitor, never the rest of the run's data. The workflow must keep "Save execution data" on: the answer is read from the run's saved output.
* **"Talk to a human" (optional):** a button under the chat. The visitor can leave an email or phone number; the conversation is sent to the person you set, by email (SMTP credential), Slack (incoming webhook) or WhatsApp, and the bot stops answering in that conversation. Messages written afterwards are kept and answered with a short note. The person replies through their own channel: there is no agent inbox in the app. If the message cannot be sent, the visitor is told and the bot keeps answering.
* Conversations of the widget are stored for 30 days. Every message is a workflow execution and counts toward the plan's monthly executions. A message has at most 4000 characters.

## Model nodes

| Node | Description |
| ---- | ----------- |
| OpenAI | GPT models with dynamic prompts |
| Anthropic | Claude models (default `claude-sonnet-5-5`) |
| Gemini | Google Gemini models |
| DeepSeek | DeepSeek models (default `deepseek-flash`) |
| Kimi | Moonshot AI's Kimi models (default `kimi-k2.6`), international or China region |
| Qwen | Alibaba Cloud's Qwen models (default `qwen-plus`), international or China region |
| Chat Model | Any OpenAI-compatible API, with a preset per provider (below) or a custom base URL |

### Chat Model provider presets

The Chat Model node's **Provider** dropdown fills in the provider's base URL and suggests its models. The list lives in `src/features/executions/lib/chat-model-providers.ts`.

| Provider | Base URL | Suggested models |
| -------- | -------- | ---------------- |
| OpenRouter | `https://openrouter.ai/api/v1` | `~openai/gpt-sol-latest`, `~anthropic/claude-sonnet-latest` |
| Groq | `https://api.groq.com/openai/v1` | use Load models |
| Together AI | `https://api.together.ai/v1` | `MiniMaxAI/MiniMax-M3` |
| Mistral | `https://api.mistral.ai/v1` | `mistral-small-latest`, `mistral-large-latest` |
| DeepSeek | `https://api.deepseek.com` | `deepseek-flash`, `deepseek-v4-pro` |
| Zhipu Z.ai (international) | `https://api.z.ai/api/paas/v4` | `glm-5.3`, `glm-5.3-flash`, `glm-5.2`, `glm-4.7`, `glm-4.7-flash`, `glm-4.5-flash` |
| Zhipu BigModel (China) | `https://open.bigmodel.cn/api/paas/v4` | the same, and `glm-4-flash-250414` |
| MiniMax (international) | `https://api.minimax.io/v1` | `MiniMax-M3`, `MiniMax-M2.7`, `MiniMax-M2.7-highspeed` |
| MiniMax (China) | `https://api.minimaxi.com/v1` | `MiniMax-M2.7`, `MiniMax-M2.7-highspeed` |
| ByteDance Volcengine Ark (Doubao) | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-seed-2-0-pro-260215`, `doubao-seed-1-6-251015`, or an endpoint ID (`ep-...`) from the console |
| Xiaomi MiMo | `https://api.xiaomimimo.com/v1` | `mimo-v2.6-pro` |
| SiliconFlow (international) | `https://api.siliconflow.com/v1` | `Qwen/Qwen3-32B` |
| SiliconFlow (China) | `https://api.siliconflow.cn/v1` | `deepseek-ai/DeepSeek-V4-Flash`, `moonshotai/Kimi-K2.7-Code` |
| Kimi (Moonshot AI) | `https://api.moonshot.ai/v1` | `kimi-k2.6`, `kimi-k3`, `kimi-k2.7-code` |
| Qwen (Alibaba Cloud) | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | `qwen-plus`, `qwen-turbo` |
| Ollama | `http://localhost:11434/v1` | use Load models |
| Custom base URL | typed in | typed in |

* **International and China platforms are separate.** Zhipu, MiniMax and SiliconFlow each run two platforms with their own accounts: an API key from one does not work on the other. Pick the preset of the platform the key came from.
* **Load models** (on the Chat Model, DeepSeek, Kimi and Qwen nodes) asks the provider for its current list with the selected credential (`GET <base URL>/models`) and shows it to pick from. When that fails, for example because the provider has no such list or refuses the key, the reason is shown and the suggested models stay. The model field always accepts a typed ID. The request goes through the same guard against private addresses as the node itself.
* **"Data processed in China"** appears under the model field when requests go to a provider's servers in mainland China: Zhipu BigModel, MiniMax (China), Volcengine Ark, SiliconFlow (China), DeepSeek, and the China region of the Kimi and Qwen nodes. It follows the address requests are sent to (`MAINLAND_CHINA_HOSTS` in the same file), so a custom base URL that is not on that list shows nothing, whatever country it is in.
* **"Free"** marks models the provider offers at no charge: Zhipu's `glm-4.7-flash`, `glm-4.5-flash` (and `glm-4-flash-250414` on BigModel), and OpenRouter models whose ID ends in `:free`. The list is `src/config/free-models.ts` and nothing else: change that file to mark or unmark a model. Free tiers have rate limits, and providers change them: the provider's pricing page is what counts.
* **Retired model IDs.** Providers retire models. Moonshot discontinued the `moonshot-v1` models (the Kimi node's old default) on 31 August 2026, and DeepSeek announced the end of the `deepseek-chat` and `deepseek-reasoner` names for 24 July 2026. A node saved with one of those keeps it, and its dialog says so and names a current model; the node is not switched on its own, because another model has another price.
* The model IDs above are what each provider's documentation showed on 10 October 2026. They go out of date; Load models does not.

### Fallback models

A Chat Model node can name up to 5 **Fallback Models**: an ordered list of other models to try when its own model does not answer.

* **When the next model is tried:** the model timed out (Fallback Timeout, 60 seconds by default), answered HTTP 429 or a 5xx error, or could not be reached. A wrong API key or a bad request (401, 400...) is **not** passed on to a fallback: that is a mistake in the settings, and the run fails with the provider's own error.
* **Each line** has a model ID and, optionally, another provider preset and another credential. Left as they are, the node's own provider and credential are used, which is the usual case for a second model at the same provider. Another provider needs its own credential.
* **Where it applies:** when the node runs as a step, and when it is the model of an AI Agent, a Text Classifier or an Information Extractor. In an agent's loop every call starts with the first model again.
* **The last model** on the list has no time limit, because nothing can take over from it.
* If every model fails, the error names each one and why: `all 3 models failed (openrouter / a: HTTP 429; groq / b: timeout; ...)`.

The DeepSeek, Kimi, Qwen, OpenAI, Anthropic and Gemini nodes have no fallback list. Put them behind a Model Router, or use a Chat Model node.

### Model Router

A sub-node for the AI Agent's **Chat Model** port. Plug one model node into its **Cheap** port and another into its **Strong** port, and connect the router to the agent.

* The agent asks the **cheap** model first.
* The **strong** model takes over when the cheap one returns **any error** (also a wrong key) or takes longer than Cheap Model Timeout (120 seconds by default). If the cheap node is a Chat Model with fallbacks, a timeout, 429 or 5xx tries those first.
* With a **Structured Output Parser** on the agent: when the cheap model's final answer does not have the required structure, the strong model answers instead (option "Switch when the output parser fails", on by default). The tools are **not** run a second time: the strong model is given the question, what the tools returned and the cheap model's draft. "Fails validation" means what it meant before: the answer is not JSON that can be read.
* If the strong model fails too, the run fails as it would without a router.

### Which model answered

Nodes that can switch models say so in their output:

| Field | Meaning |
| ----- | ------- |
| `modelUsed`, `providerUsed` | The model that gave the (final) answer |
| `fallbackUsed` | `true` when a model other than the first choice answered at least one call |
| `modelAttempts` | Every attempt in order: `{ provider, model, outcome }`, where outcome is `answered`, `timeout`, `connection error`, `HTTP 429`... The provider's error text is not kept here |
| `modelRoute` | AI Agent with a Model Router only: `{ tier: "cheap" \| "strong", reason }` |

They are on the Chat Model, DeepSeek, Kimi and Qwen nodes (`{{chatModel.modelUsed}}`) and on the AI Agent (`{{aiAgentOutput.modelUsed}}`); the Text Classifier and Information Extractor have `modelUsed` and `fallbackUsed`. Token usage and cost (see AI token usage and cost) are recorded per model that answered, each at its own price.

## AI nodes

| Node | Description |
| ---- | ----------- |
| Model Router | Plugs into the AI Agent's Chat Model port: a cheap model first, a stronger one when it fails or its answer does not fit the parser |
| Text Classifier | Sorts text into your categories with a connected model and continues on that category's output |
| Information Extractor | Pulls named values (`name (type): description`) out of free text |
| Analyze Image / Document | Reads an image or a PDF, scans included, with a vision model: all its text (OCR), named fields, or a description. See "Analyze Image / Document" |
| Structured Output Parser | Plugs into the AI Agent's Parser port to force a JSON structure |
| Vector Store | Insert, search and delete documents by meaning (RAG), with OpenAI, Gemini or OpenAI-compatible embeddings. Text splitting, metadata filters, reranking, and pgvector when the database has it (see "Vector Store and Document Loader") |
| Document Loader | Loads a Google Drive folder or a Notion database into a Vector Store collection, skipping documents that have not changed |
| MCP Client | Gives an AI Agent the tools of an MCP server (Streamable HTTP transport) |

### Vector Store and Document Loader (RAG)

The Vector Store keeps text in chunks with an embedding each, per user and collection, and finds the chunks closest in meaning to a query. The Document Loader fills a collection from a Google Drive folder or a Notion database.

**Inserting**

* **Split By** cuts long text into chunks: by **characters** (the default, as before), by **tokens**, or by **Markdown headings**. Chunk Size and Chunk Overlap apply to all three; an overlap of 0 means none.
  * Tokens are estimated at four characters each. No tokenizer is bundled, and Urdu, Arabic or Chinese text makes more tokens than that.
  * With Markdown headings every section is a chunk of its own and starts with the headings it sits under ("Guide > Returns"), which are also saved as the chunk's `heading` metadata. A section longer than Chunk Size is cut further; a `#` inside a code block is not a heading.
* **Document ID** (optional) names the document. Inserting the same text again then does nothing (`unchanged: true`), and a changed text replaces the old chunks instead of adding to them. Without it every insert adds chunks, as before.
* One document can make at most 200 chunks.

**Searching**

* **Metadata Filter** is a JSON object, for example `{"source": "faq"}`. Only chunks whose metadata contains every field of it with the same value are searched (nested objects too; a list in the filter needs each of its entries in the stored list). Values are not converted: `3` does not match `"3"`.
* **Rerank With** fetches more candidates than Limit (five times as many, between 20 and 50), has a second model read the query together with each one, and returns the best Limit:
  * **Cohere Rerank** or **Jina Reranker**, with a Rerank Credential (a Cohere key, or the Jina key also used by Read Web Page). Their calls are not in the AI usage figures, because they are not billed by token.
  * **Connected chat model**: connect a model node to the Vector Store's **Rerank Model** port. Its call is recorded like any other. If its answer is not a list of passage numbers, the results keep their order and `rerankNote` says so.
  * Each match keeps its embedding `score` and gets a `rerankScore`; `reranked` says whether the order came from the reranker.
* `engine` in the result says who compared the embeddings: `pgvector`, `pgvector-index` or `app`.

**pgvector**

* When the database has the `vector` extension, the migration creates it and adds an `embeddingVector` column next to the existing `embedding` array, with HNSW indexes for embeddings of 768, 1024, 1536 and 3072 dimensions (cosine distance). Searches are then answered by the database, with no limit on the size of a collection.
* A collection of up to 10,000 chunks is compared exactly, in the database. Above that the index is used when there is one for the model's size and pgvector is 0.8 or newer; if the index finds fewer chunks than asked for, the exact comparison runs after it.
* **The old way stays as the fallback.** Without the extension, with `VECTOR_STORE_ENGINE=app`, or when a pgvector query fails, the collection's most recent 5000 chunks are read and compared in the app, as before. Every chunk keeps its plain array for that.
* **Existing stores keep working unchanged.** Chunks saved before the upgrade get their pgvector value the first time their collection is searched or inserted into.
* If the extension cannot be set up, the migration still succeeds and writes a warning. The drift check then shows the `embeddingVector` column as missing.

**Document Loader**

* **Google Drive Folder**: every Google Doc (exported as Markdown), Sheet (first sheet, as CSV) and Slides file, PDF with a text layer, Word `.docx` and text file directly in the folder. Sub-folders are not opened; pictures, scanned PDFs and old Office formats are skipped with the reason.
* **Notion Database**: every row is one document made of its title, its properties as `Name: value` lines, and the page's blocks as Markdown. Share the database with your Notion integration first.
* **Unchanged documents are skipped.** Every chunk stores a hash of its document (text, embedding model, split settings and metadata) and the source's own version of it (Drive's modified time and checksum, Notion's last edited time). A document whose version is the same is not even downloaded; one whose text turns out to be the same is not embedded again; a changed one replaces its old chunks in one transaction.
* It needs two credentials: the **Source Credential** (a Google account, or a Notion integration) and the **Embeddings Credential**.
* **Max Documents** (default 25, up to 100) are read per run, most recently changed first. Each document is its own step, and one that fails is reported in `documents` without stopping the others.
* **Remove Deleted Documents** (off by default) also removes the chunks of documents that are no longer in the folder or database. It only acts when the run saw the whole source.
* Chunks get `source`, `title`, `url` and `documentId` metadata, plus your own, so a search can filter on them.
* Put it after a Schedule Trigger to keep a collection up to date.

### Analyze Image / Document

OCR and vision for a file a workflow has: a Form Trigger upload, an HTTP Request download, a Google Drive or Gmail file.

* **Input:** a file variable (`form.invoice`, `download.file`) that holds an image (JPEG, PNG, WebP, GIF, TIFF) or a PDF.
* **Modes:**

  | Mode | Result |
  | ---- | ------ |
  | Extract All Text | `{{analysis.text}}`: the document's text in reading order, tables as rows |
  | Extract Fields | `{{analysis.output.<field>}}`, from lines of `name (type): description`, the same format and types as the Information Extractor. A field the document does not have is null |
  | Describe | `{{analysis.description}}`; "What To Describe" can ask something specific |

* **Model:** connect a model that can read images to the node's Model port: OpenAI, Gemini or Anthropic, or a Chat Model node with a vision model of its provider (for example GLM-4.6V on Zhipu, or a Qwen-VL model). A model that cannot read images fails with the provider's error and a hint to use a vision model. A Chat Model's fallback models are used as usual, and the call is counted in AI usage and cost.
* **PDFs:** each page that has text is given to the model as that text. A page without text is a scan: the picture on it is taken out of the PDF and given to the model as an image. So a typed PDF costs text tokens, a scanned one image tokens, and a mixed one each page as it is.
* **Max Pages (PDF):** how many pages are read, from the first; default 5. The server's limit is 20 (`VISION_MAX_PDF_PAGES`). The result says how much was read: `pages`, `pagesRead`, `truncated` and `scannedPages`.
* **Images** are turned upright and scaled down to 1600 pixels on their longest side before they are sent.
* Text inside the document is treated as content, never as instructions to the model. As an AI Agent tool the node counts as Read.
* Limits: scanned pages are not redrawn, the scanner's picture is used as it is. A page that is only vector drawings without text gives nothing; a scan stored as many small strips is read from its first four pieces. Reading a PDF has the same time limit as Extract from File. HEIC photos are not supported: convert them to JPEG first.
* **Templates:** two templates in the gallery use it: **Invoice to Google Sheets** (upload form, extract fields, append a row) and **CV screening: score and email** (upload form, extract text, score against your job description, email the result).

---

# 🔔 Trigger Nodes

| Trigger             | Description                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| Manual Trigger      | Manual execution on user demand                                                                            |
| Schedule Trigger    | Time-based automatic triggers evaluated each minute using custom Cron intervals (e.g., `*/5 * * * *`)       |
| Webhook Trigger     | Runs on any HTTP request to `/api/webhooks/trigger/<workflowId>`, protected by a per-node secret. Respond immediately, when the last node finishes, or with a Respond to Webhook node |
| Chat Trigger        | Runs when a message is sent from the editor's chat panel, or (with "Make chat public") from the hosted chat page or the website widget; provides `chatInput` and `sessionId` |
| Telegram Trigger    | Runs when your bot receives a message. The bot's webhook is registered when the workflow is activated. A voice message is given as a file at `{{telegram.voice}}` |
| WhatsApp Trigger    | Runs when your WhatsApp Business number receives a message (verify token + signature check). With a WhatsApp credential selected, a voice message is given as a file at `{{whatsapp.voice}}` |
| Gmail Trigger       | Runs when a new email arrives; polls every 1, 5, 15 or 60 minutes with an optional Gmail search filter      |
| Messenger Trigger   | Runs when someone messages your Facebook Page (verify token + signature check; see "Messenger and Instagram") |
| Instagram Trigger   | Runs when your Instagram professional account receives a direct message (verify token + signature check)    |
| Typeform Trigger    | Runs when a typeform is submitted; answers are available by question title                                 |
| Shopify Trigger     | Runs when an order is created, paid, fulfilled or cancelled, a product is created or updated, a customer is created or a checkout changes (HMAC signature check; see "Shopify and WooCommerce") |
| WooCommerce Trigger | Runs when an order is created, updated or paid, or a product or customer changes (signature check; optional order status filter) |
| Form Trigger        | Runs when someone submits the workflow's own hosted form at `/forms/<id>` (see "Forms")                    |
| RSS Feed Trigger    | Runs when a new item appears in an RSS or Atom feed; polls every 1, 5, 15, 60 minutes or daily             |
| Google Form Trigger | Form submission automation                                                                                 |
| Stripe Trigger      | Payment event automation                                                                                   |
| Error Trigger       | Runs when a workflow fails (this workflow, or all of your workflows), for alerts                           |
| When Executed by Another Workflow | Start of a sub-workflow called by an Execute Workflow node or an AI Agent tool               |

Telegram, WhatsApp, Messenger, Instagram, Typeform, Shopify, WooCommerce and Stripe need `NEXT_PUBLIC_APP_URL` to be a public https address. Every webhook route is rate limited per workflow.

## Duplicate deliveries and retry

Providers re-send an event when they are unsure it arrived. Each trigger remembers the events it accepted for 7 days and ignores a repeat:

| Trigger | Recognised by |
| ------- | ------------- |
| Stripe | The event id |
| WhatsApp | The message id |
| Messenger, Instagram | The message id (`mid`) |
| Telegram | The update id |
| Typeform | The submission's event id |
| Shopify | The event id Shopify sends with every attempt (`X-Shopify-Event-Id`), per event type |
| WooCommerce | The delivery id; for "Order paid" and the order status filter, the order itself, so an order starts one run however often it is updated |
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
| Web Search       | Search the web with Tavily, Brave Search or your own SearXNG server; titles, links and snippets. Also an AI Agent tool. See "Web Search and Read Web Page" |
| Read Web Page    | Fetch a page and return its main content as clean Markdown or text, cut to a length you set. Also an AI Agent tool. Private and local addresses are blocked |
| Transcribe Audio | Turn a voice message or audio file into text with OpenAI Whisper, Groq Whisper or any OpenAI-compatible server. See "Audio" |
| Text to Speech   | Turn text into spoken audio with OpenAI TTS or an OpenAI-compatible server; the result is a file |
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
| Wait             | Pause for a time, until a date, or until the execution's resume URL is called; timeout that continues or fails; cancellable |
| Send and Wait for Approval | Ask a person to approve or reject (in the app, by email, Slack, Telegram or WhatsApp) and continue through the Approved or Rejected output |
| Form             | The next page of a multi-step hosted form; the workflow waits until it is submitted |
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

## Audio

Two nodes that speak the OpenAI audio API, and voice messages on the two chat triggers.

* **Providers** (each node's Operation): **OpenAI**, **Groq**, or **OpenAI-compatible (custom base URL)** for any service or self-hosted server that offers the same endpoints. OpenAI uses an OpenAI credential; Groq and custom servers use a "Chat Model API Key" credential. A custom base URL goes through the SSRF guard: a server on a private network has to be on `PRIVATE_NETWORK_ALLOWLIST`.

**Transcribe Audio** (`/audio/transcriptions`)

* **File:** a file variable holding audio: `telegram.voice`, `whatsapp.voice`, a Form Trigger upload, an HTTP Request download. MP3, M4A, WAV, OGG, WebM, FLAC or MP4, up to the workflow file size limit.
* **Model:** `whisper-1` on OpenAI and `whisper-large-v3-turbo` on Groq when left empty; required for a custom server.
* **Language** (optional, a code such as `en`, `ur`, `ar`) makes the result more accurate; **Hint** (optional) helps with names and unusual words.
* **Result:** `{{transcript.text}}`, and `language` and `duration` when the server reports them.

**Text to Speech** (`/audio/speech`)

* **Text** up to 4096 characters, a **Model** (`tts-1` on OpenAI when left empty; required for Groq and custom servers), a **Voice** (`alloy` when left empty) and a **Format**: MP3, Opus (an Ogg file, the format of voice messages) or WAV.
* **Result:** a file reference at `{{speech.file}}`, stored like every other workflow file (same size limit and storage quota, removed after the retention period). Use `speech.file` in a Telegram or WhatsApp node's File field or in an email's Attachments.

**Voice messages on the Telegram and WhatsApp triggers**

* **Telegram Trigger:** a voice message (or audio file) is downloaded with the trigger's bot credential and added to the data as a file: `{{telegram.voice}}`, with its `duration`.
* **WhatsApp Trigger:** has a new, optional **WhatsApp Credential**. With it selected, a voice message is downloaded and added as `{{whatsapp.voice}}`. Without it everything works as before and text messages need nothing.
* A voice message that cannot be fetched (no credential, larger than the file size limit, a download error) does not fail the run: the message still arrived, and `{{telegram.voiceError}}` / `{{whatsapp.voiceError}}` says why there is no file.
* **A voice bot:** Telegram Trigger → Transcribe Audio (File `telegram.voice`) → AI Agent (Source for Prompt "Define below", Prompt `{{transcript.text}}`) → Text to Speech (Text `{{aiAgentOutput.output}}`, Format Opus) → Telegram (File `speech.file`). The Telegram node sends the audio as a file, not as a voice note. A voice message has no text, so `{{chatInput}}` is empty for it: the agent's prompt has to come from the transcript. For a bot that takes both, put an IF on `{{telegram.voice.id}}` first.
* Transcription and speech are billed by the provider per minute or per character, not per token, so they are not in the AI usage and cost figures. As AI Agent tools both nodes count as Read.

## Web Search and Read Web Page

Two nodes that bring the web into a workflow. Both work as ordinary steps and as **AI Agent tools**: connect them to an agent's Tools port and let the agent fill in the query or the address with `{{$fromAI "query"}}` / `{{$fromAI "url"}}`. They count as Read tools, so they need neither "Allow dangerous tools" nor approval.

**Web Search**

* **Providers** (the node's Operation): **Tavily** and **Brave Search**, each with an API key credential of its own, and **SearXNG**, your own server, with its address typed into the node and no credential. SearXNG needs its JSON output switched on (`json` under `search.formats` in its `settings.yml`); a server on a private network also has to be on `PRIVATE_NETWORK_ALLOWLIST`.
* **Result:** `{{search.results}}`, a list of `{ title, url, snippet }`, plus `{{search.count}}`. The three providers come back in the same shape. Connect a Split Out node to handle the results one by one.
* **Max Results** (default 5, up to 20) and **Max Characters Per Result** (default 500): each snippet is cut to that length.

**Read Web Page**

* **Built-in reader** (default, no account): downloads the page and keeps its main content: the `<article>` or `<main>` if there is one, otherwise the block with the most real text. Menus, headers and footers, sidebars, cookie banners, share buttons, comments, scripts and hidden elements are left out. Output is Markdown (headings, lists, links with full addresses, bold, code, quotes, tables as rows) or plain text.
* **Jina Reader** and **Firecrawl** (optional, each with its own credential): for pages that build their content with JavaScript, which the built-in reader sees as empty. The built-in reader says so when it finds no text.
* **Result:** `{{page.content}}`, `{{page.title}}`, `{{page.description}}`, `{{page.url}}` (after redirects), `{{page.truncated}}` and `{{page.length}}` (the length of the whole page).
* **Max Characters** (default 8000, up to 100000): the text is cut to that length, at the end of a word, and ends with a note that it was cut, so a model reading it knows there was more. Web pages can be very long, and every character is paid for again as model input; this is the setting that controls that cost.
* **SSRF guard:** the page, and every redirect on the way, goes through the same guard as the HTTP Request node, so private, local and cloud-metadata addresses are refused. The address is also checked before it is handed to Jina Reader or Firecrawl. A download stops at 3 MB and after 20 seconds, and only web pages and text are read (a PDF or image address is refused with a pointer to the HTTP Request node).
* The built-in reader is deliberately small: no JavaScript, no login, no paywalls, and it reads a page as the server sent it. It announces itself as `RXJ-PageReader`; some sites refuse automated readers.
* What a page says is data. As an agent tool the text is handed to the model inside the same `<tool_result>` block as every other tool result, marked as untrusted.

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
| Shopify          | Orders, products, customers, inventory levels and abandoned checkouts (see "Shopify and WooCommerce") |
| WooCommerce      | Orders, order notes, products and customers through the REST API           |
| Postgres         | Run parameterised SQL, select rows, insert rows. Expressions go in Query Parameters, not in the query text |
| MySQL            | Run parameterised SQL, select rows, insert rows (MySQL and MariaDB). Same rule for expressions |

---

## Shopify and WooCommerce

Two store nodes and two triggers. The nodes can also be AI Agent tools: reading is "read", creating and updating is "write" (so it asks for approval by default).

| Node | Operations |
| ---- | ---------- |
| Shopify | Get, list and update orders; get, list, create and update products; get, search, create and update customers; get, set and adjust an inventory level; list locations; list abandoned checkouts |
| WooCommerce | Get, list and update orders; add an order note; get, list, create and update products (with stock quantity); get, list, create and update customers |

* **Shopify** uses the Admin REST API with a custom app's access token. The node's **Shop Domain** must be the store's `myshopify.com` address: the token is sent nowhere else. Shopify calls the REST API "legacy" and is moving to GraphQL, but still serves it; the node asks for version `2025-01`, Shopify answers a retired version with its oldest supported one, and **API Version** can be set on the node.
* **WooCommerce** uses REST API v3 with a consumer key and secret, sent as HTTP Basic authentication. **Store URL** must be `https`. The key is never put in the address. Some hosts remove the `Authorization` header before WordPress sees it, and the store then answers 401 "cannot list resources" with a correct key; that has to be fixed on the host.
* **Lists** come back as `{{json <name>.items}}` and `{{<name>.count}}`, at most 100 (default 20). Put a **Split Out** node with Input List `<name>` after one to run the next nodes once per item. **Fields** limits what each item contains; an answer over 3 MB is refused with that advice.
* **Additional Fields** takes a JSON object in the store's own field names, merged into what is sent, for anything the node has no field for.
* A redirect from the store is not followed, because the request carries the key. The error names where the store pointed, so the address can be corrected.
* **Inventory** in Shopify belongs to an *inventory item* at a *location*: take `variants.0.inventory_item_id` from Get Product and a location from List Locations.
* **List Abandoned Checkouts** returns checkouts that were started, not completed, and last touched between "at least" and "at most" minutes ago. By default those without an email address and phone number are left out.

### Store triggers

| Trigger | Set up in the store | Signature |
| ------- | ------------------- | --------- |
| Shopify Trigger | Settings > Notifications > Webhooks: one webhook per event, format JSON, the node's Webhook URL | `X-Shopify-Hmac-Sha256`, checked with the signing secret shown on that page (or the app's API secret key for a webhook an app created) |
| WooCommerce Trigger | WooCommerce > Settings > Advanced > Webhooks: status Active, a topic, the node's Webhook URL as Delivery URL, and a Secret | `X-WC-Webhook-Signature`, checked with the same Secret typed into the node |

* Each trigger node listens for one **Event** (or any). A correctly signed delivery of another event is answered `200` and starts nothing, because both stores switch a webhook off when it keeps failing.
* **Shopify events:** order created, paid, updated, fulfilled, cancelled; product created, updated; customer created; checkout created, updated.
* **WooCommerce events:** order created, updated; product created, updated; customer created; and **Order paid**, which WooCommerce has no topic for. Give the WooCommerce webhook the topic *Order updated*: the run starts once per order, the first time the order has a payment date.
* **Only When The Order Status Is** (WooCommerce) starts a run only for orders in that status, once per order and status. WooCommerce often sends "Order updated" several times for one change.
* **Activate the workflow before saving the webhook in WooCommerce.** WooCommerce checks the address when the webhook is saved and reports an error for a workflow that is not active.
* The run starts with `{{shopify.event}}`, `{{shopify.id}}`, `{{shopify.email}}`, `{{shopify.phone}}`, `{{shopify.customerName}}` and the store's whole payload at `{{shopify.order}}` (or `.product`, `.customer`, `.checkout`); the same names under `{{woocommerce...}}`. `phone` and `email` are taken from wherever the payload has them (an order has a phone number in up to five places).
* Signed events are not refused for being old, unlike Stripe and Typeform: Shopify retries a failed delivery for hours, so an age limit would drop real orders after an outage. A repeat is stopped by the duplicate check for 7 days; a signed request that someone captured could start a run again after that.

---

# 💬 Messaging Integrations

| Integration | Description         |
| ----------- | ------------------- |
| Discord     | Discord automation  |
| Slack       | Slack notifications |
| Telegram    | Bot messaging: text, or a file with a caption, and the Telegram Trigger for incoming messages |
| WhatsApp    | Text, template and file messages via the WhatsApp Business Cloud API, and the WhatsApp Trigger |
| Messenger   | Text and picture replies to people who wrote to your Facebook Page, and the Messenger Trigger |
| Instagram   | Text and picture direct messages, the Instagram Trigger, and photo posts (with the Instagram / Facebook Post node) |
| Twilio      | SMS and WhatsApp messages |
| Email       | SMTP email, with file attachments |
| Gmail       | Email through a connected Google account, with file attachments |
| Resend      | Email through the Resend API, with file attachments |
| SendGrid    | Email through the SendGrid API, with file attachments |

## Messenger and Instagram

Three nodes and two triggers on Meta's Graph API. As AI Agent tools all three nodes are "write", so they ask for approval by default.

| Node | What it does |
| ---- | ------------ |
| Messenger | Sends a text or a picture to someone who wrote to your Facebook Page |
| Instagram | Sends a text or a picture as a direct message from your Instagram professional account |
| Instagram / Facebook Post | Publishes a photo with a caption on the Instagram account or on the Facebook Page |
| Messenger Trigger, Instagram Trigger | Start a run for each incoming message, with `chatInput` and `sessionId` for an AI Agent |

* **Who can be written to.** A Page or an Instagram account can only message people who wrote to it first, and by their id from the trigger (`{{messenger.from}}`, `{{instagram.from}}`), not by name or phone number. A plain reply arrives within 24 hours of the person's last message. **Message Type** offers Meta's tags for later messages (human agent, post-purchase update and so on); they are not for promotion.
* **Two ways an Instagram account is connected**, chosen on the node as **Account Connected**: through a Facebook Page (a *Facebook Page* credential, calls go to `graph.facebook.com`) or with Instagram Login (an *Instagram* credential, calls go to `graph.instagram.com`). Messenger and Facebook Page posts always use the Facebook Page credential.
* **The token** is sent in an `Authorization` header to those two hosts only, never in an address.
* **Pictures.** Meta does not take an upload for these calls: it downloads the picture from a web address. The **Image** field takes a public `https` address, or a file variable. A file is handed over as its signed download link (valid 15 minutes), so the app has to run on a public `https` address for that. An address on a private network is refused.
* **Instagram posts** take JPEG only, between 4:5 and 1.91:1 in shape, with a caption of up to 2200 characters. The node makes a container, waits until Instagram has prepared it (up to 20 seconds) and publishes it. With a Facebook Page credential and no Instagram Account ID, the Instagram account connected to the Page is looked up.
* **A post is public as soon as the node has run** and is not taken back when a later node fails.
* **Triggers** use the same two checks as the WhatsApp Trigger: Meta's verify token when the webhook is saved, and the `X-Hub-Signature-256` signature (made with the app secret) on every event. Echoes of the account's own messages, deleted messages, read and delivery receipts and reactions start nothing. Button taps and quick replies do, with their payload at `{{messenger.payload}}`. Attachments are given as a list of `{ type, url }`; they are not downloaded.
* **One address per Meta app.** Meta sends all of an app's Page (or Instagram) events to one Callback URL, so one app feeds one workflow per channel.
* Receiving messages from people who are not testers of the app needs Meta's app review (`pages_messaging`, `instagram_manage_messages` or `instagram_business_manage_messages`); posting needs `pages_manage_posts` or `instagram_content_publish` / `instagram_business_content_publish`.

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
| OPENAI_COMPATIBLE | Chat Model node (the API key of whichever provider preset is picked: OpenRouter, Groq, Zhipu, MiniMax, Ollama...) |
| SMTP          | Email node    |
| GOOGLE_OAUTH2 | Gmail, Gmail Trigger, Google Drive, Google Sheets, Google Calendar ("Sign in with Google") |
| GOOGLE_SHEETS | Google Sheets (service account) |
| GOOGLE_CALENDAR | Google Calendar (service account) |
| NOTION        | Notion nodes  |
| TELEGRAM      | Telegram node and Telegram Trigger |
| WHATSAPP      | WhatsApp node (Cloud API access token) |
| FACEBOOK_PAGE | Messenger node, Facebook Page posts, and Instagram through a Page (Page access token) |
| INSTAGRAM     | Instagram node and posts for an account that uses Instagram Login (Instagram access token) |
| TWILIO        | Twilio node (`AccountSID:AuthToken`) |
| RESEND        | Resend node (API key) |
| SENDGRID      | SendGrid node (API key) |
| TAVILY        | Web Search node with Tavily (API key) |
| BRAVE_SEARCH  | Web Search node with Brave Search (subscription token) |
| JINA_READER   | Read Web Page node with Jina Reader, and the Vector Store's Jina reranker (API key) |
| COHERE        | The Vector Store's Cohere reranker (API key) |
| FIRECRAWL     | Read Web Page node with Firecrawl (API key) |
| GITHUB        | GitHub node (personal access token) |
| AIRTABLE      | Airtable node (personal access token) |
| JIRA          | Jira node (`email:api-token`) |
| HUBSPOT       | HubSpot node (private app access token) |
| SALESFORCE    | Salesforce node ("Connect Salesforce", production or sandbox) |
| SHOPIFY       | Shopify node (a custom app's Admin API access token, `shpat_...`) |
| WOOCOMMERCE   | WooCommerce node (`consumer_key:consumer_secret`) |
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
* **Webhooks:** per-node secrets or provider signatures (Stripe, WhatsApp, Messenger, Instagram, Typeform, Telegram, Shopify, WooCommerce), and a per-workflow rate limit.
  * Every secret, token and signature is compared in constant time (`secretsMatch` in `src/lib/webhook-security.ts`, built on `crypto.timingSafeEqual`).
  * **Stripe and Typeform events older than 5 minutes are refused**, so a captured request cannot be sent again later. Stripe signs its own timestamp. Typeform's signature has none, so the submission's `submitted_at` (which is inside the signed body) is used. A Typeform delivery that is retried more than 5 minutes after the form was submitted, for example after the app was down, is therefore refused and shows as failed in Typeform.
  * **Telegram:** activating a workflow registers the bot's webhook with a `secret_token`, and every update has to carry it in `X-Telegram-Bot-Api-Secret-Token`. The token is derived from `ENCRYPTION_KEY`; without that key no webhook is registered and no update is accepted.
  * **Polar:** both places Polar can post to verify its signature with `POLAR_WEBHOOK_SECRET`: the Better Auth plugin's `/api/auth/polar/webhooks` and `/api/webhooks/polar`. Without the secret the second answers 503 and changes nothing.
* **Inngest:** in production (`NODE_ENV=production`) the server refuses to start without `INNGEST_SIGNING_KEY`, the key that proves a call to `/api/inngest` comes from Inngest. `next build` is not affected.
* **Security headers** on every response (`src/config/security-headers.ts`, wired in `next.config.ts`):

  | Header | Value | Where |
  | ------ | ----- | ----- |
  | `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | everywhere, in production only |
  | `X-Frame-Options` | `DENY` | everywhere except the hosted chat page `/chat/<id>` |
  | `X-Content-Type-Options` | `nosniff` | everywhere |
  | `Permissions-Policy` | camera, microphone, geolocation, payment, USB and the motion sensors switched off | everywhere |
  | `Referrer-Policy` | `strict-origin-when-cross-origin` | pages (API routes that need one set their own) |
  | `Content-Security-Policy-Report-Only` | the policy described below | pages |

  * **The Content-Security-Policy is report-only.** Browsers report what it would block and block nothing. Reports go to the app's Sentry project, or to `CSP_REPORT_URI` if that is set. It allows the app's own origin, inline scripts and styles (Next.js and the UI libraries need them), images from any https address, connections to any https or wss address, and Cloudflare's Turnstile; it refuses plugins, foreign `<base>` and form targets, and being framed. The plan is to tighten it from the reports and then enforce it.
  * **Only the website chat widget can be embedded.** No page can be shown in a frame on another site, with one exception: the hosted chat page `/chat/<id>`, which the widget frames. `/chat` is the only entry of `EMBEDDABLE_PATH_PREFIXES` in `src/config/security-headers.ts`; only those paths lose `X-Frame-Options` and `frame-ancestors 'none'`. The chat page then sends its own enforcing `Content-Security-Policy: frame-ancestors ...` for each widget: the widget's allowed domains, any site when the list is empty, and `'none'` when there is no such public chat. The widget's API (`/api/chat/...`), its script and every other page stay `DENY`.
  * `preload` is not in the HSTS header: it is hard to undo. Add it there once every subdomain is https for good.
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

## AI token usage and cost

Every call to a language or embedding model is written down with the tokens the provider reported: input, output and cached input. This covers the AI Agent, the model nodes (OpenAI, Anthropic, Gemini, Chat Model, DeepSeek, Kimi, Qwen), the Text Classifier, the Information Extractor, the Vector Store's embeddings and chat-model reranking, and the Document Loader's embeddings, also when one of them runs as an AI Agent tool. Only counts are stored, never prompts or answers, and they are kept after an execution's data is deleted so the month stays complete.

* **Price table.** An admin with two-factor on sets what each model costs under **Settings → AI model prices**: provider, model, and US dollars per million input, output and cached input tokens. Provider and model are matched exactly, ignoring case. The provider is `openai`, `anthropic`, `gemini`, the Chat Model preset (`openrouter`, `deepseek`, `kimi`...) or `custom`. The table starts empty; the card lists the models that ran without a price so they can be added with one click. Price changes are in the audit log.
* **Cost** is worked out when the call is made, from the price at that moment. Changing a price later does not change calls already recorded. A model without a price shows as "No price": it is not counted as free and not counted as money.
* **Execution view.** An execution's page has an **AI usage** table: one line per node and model with calls, tokens and cost, and the total of the run. An AI Agent's calls are one line per model that answered.
* **Billing page.** **AI spend this month** shows the total since the 1st (UTC), the tokens, and the spend per workflow.
* **Budgets (optional).** A monthly AI budget can be set for the account (Billing page) and for a workflow (editor → settings icon → **Monthly AI budget**). When the month's spend reaches a budget, the next node that calls a model stops the run with "Monthly AI budget reached..." until the budget is raised, removed, or the month ends. The check runs before each AI node, so the month can end slightly over the budget, by what the last node cost.

The amounts are estimates for keeping an eye on spend. You pay your providers directly and their invoice is what counts: tokens written to a provider's cache are priced as normal input, and a model without a price does not count towards a budget.

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

* **Built-in templates** are added by database migrations and can be edited or hidden by an admin like any other: *Invoice to Google Sheets*, *CV screening: score and email*, *Shopify order paid: WhatsApp confirmation* and *Shopify abandoned cart: email reminder*. The WhatsApp one sends an approved message template, because WhatsApp does not let a business start a conversation with free text; its description says how to set that up and how to switch it to WooCommerce. The abandoned cart one runs every hour and emails the shoppers whose checkout was last touched one to two hours ago.
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
* **Audit log.** The Settings page lists what happened on the account, latest first, with the time and the IP address it came from:
  * credentials created, updated (saying whether the secret was replaced or only the name changed) and deleted, including Google and Salesforce accounts connected through their sign-in;
  * workflows activated, deactivated and deleted;
  * API keys created and revoked (by name and visible prefix);
  * templates published, updated and deleted, saying when one was saved despite the secret scan;
  * sign-ins, with how: password, password and two-factor code or backup code, Google, GitHub, or the email confirmation link. A password that still needs a two-factor code is not a sign-in until the code is accepted. Failed attempts are not listed;
  * two-factor authentication turned on or off, and new backup codes.

  Each line holds the action, a name and id of what it was done to, the address and the time; never a secret, a key or a password. Lines are only ever added: the app has no way to change or remove one, and they go when the account itself is deleted. Each user sees their own log. If a line cannot be written, the action it describes still succeeds and the failure is logged on the server.

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

**A database set up before 10 October 2026.** The 38 migrations that existed until then were replaced by one, `20261010000000_baseline`, because the old history could not be replayed on an empty database. A new database needs nothing special: `migrate deploy` applies the baseline and everything after it. A database that already has the old history must be told once that the baseline is what it holds, or `migrate deploy` will try to create tables that exist:

1. Make sure it was fully migrated with the old history, up to `20261009150000_execution_retention_and_save_setting`, and matches the schema of that time. If it stopped at an older migration, bring it up to date from a checkout made before the change first.
2. Clear Prisma's migration history. This empties Prisma's own bookkeeping table and touches no application table:

   ```bash
   echo 'DELETE FROM "_prisma_migrations";' | npx prisma db execute --stdin --schema prisma/schema.prisma
   ```

3. Mark the baseline as applied, then apply what came after it:

   ```bash
   npx prisma migrate resolve --applied 20261010000000_baseline
   npx prisma migrate deploy
   ```

`npx prisma migrate status` should then report "Database schema is up to date!".

Run the checks that need no database or external service:

```bash
npx tsx --conditions=react-server src/inngest/__test__/testCoreNodes.ts
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
```

Step-by-step workflows for testing every node by hand are in [`docs/TESTING.md`](docs/TESTING.md).

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and on every push to `main`. It has four jobs, each of which fails the run on its own:

| Job | What it runs |
| --- | ------------ |
| Type check | `npx tsc --noEmit` (with the 8 GB heap the project needs) |
| Core node tests | `npx tsx --conditions=react-server src/inngest/__test__/testCoreNodes.ts` |
| npm audit | `npm audit --audit-level=high`: fails on a known vulnerability of high or critical severity in any dependency |
| Secret scan | [gitleaks](https://github.com/gitleaks/gitleaks) over the commits of the push or pull request, with `.gitleaks.toml` |

* The jobs only read the repository. None has the database address or any other secret of the app, and none migrates or deploys: `DATABASE_URL` in the workflow is a placeholder that `prisma generate` reads without connecting.
* `.gitleaks.toml` uses gitleaks' own rules and skips two places that hold made-up secrets on purpose: `src/inngest/__test__/` and `docs/TESTING.md`. A real secret must never go into those.
* `.github/dependabot.yml` has Dependabot open pull requests once a week: one for all minor and patch updates of npm packages, separate ones for major updates, security updates and GitHub Actions. They run through the same CI and are merged by hand, because a merge to `main` deploys.

## Deploying (Vercel)

The live app on Vercel and local development use the **same** database, so the schema only changes in one controlled way.

* **The build command** is `npm run build`: `prisma generate`, then `node scripts/migrate-on-deploy.mjs`, then `next build`.
* **Production deploys migrate the database.** When Vercel builds a production deployment (`VERCEL_ENV=production`, which is what a merge to `main` produces), the script runs `prisma migrate deploy` before the app is built. Pending migrations are applied; with none pending it changes nothing.
* **Preview deployments and local builds never migrate.** They use the same database, and a preview is built from a branch that has not been merged. The script prints that it left the database alone and the build goes on.
* **A failed migration fails the build.** Vercel then keeps serving the previous deployment, so new code is never live on a database it was not migrated for.
* **Migrations reach production by merging to `main`, and no other way.** A pull request that adds a folder under `prisma/migrations` changes the production database the moment it is merged, so read its SQL as part of the review.
* **Migrations have to work with the code that is already live.** The database is migrated a few minutes before the new code replaces the old, and if the build fails after the migration the old code stays. So migrations only add: new tables, and new columns that are nullable or have a default. Removing or renaming something is done in a later change, once no deployed code uses it.
* `DATABASE_URL` must be available to the build on Vercel (it already is for `prisma generate`), and should be a direct connection, not a pooled one: `prisma migrate deploy` takes a lock that connection poolers can break.
* `INNGEST_SIGNING_KEY` has to be set in the production environment, or the server does not start (see "Security").

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
| `POLAR_*` | Billing (access token, product IDs, webhook secret, success URL). `POLAR_WEBHOOK_SECRET` is what Polar's webhooks are verified with |
| `INNGEST_SIGNING_KEY` | Proves that calls to `/api/inngest` come from Inngest. **Required in production**: the server does not start without it |
| `PRIVATE_NETWORK_ALLOWLIST` | The private addresses workflows may reach, comma-separated: hosts, `host:port` or CIDR ranges, e.g. `127.0.0.1:11434,10.0.0.0/24` (self-hosting only) |
| `ALLOW_PRIVATE_NETWORK_REQUESTS` | `true` lets workflows reach every private address. Still works, but logs a warning: prefer `PRIVATE_NETWORK_ALLOWLIST` |
| `WEBHOOK_RATE_LIMIT_PER_MINUTE`, `API_RATE_LIMIT_PER_MINUTE` | Requests per minute for one workflow's webhook URL, and for one API key. Default 120 each |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile on the sign-up form. Both or neither: with neither the check is off |
| `CSP_REPORT_URI` | Where browsers send Content-Security-Policy reports. Not set: the app's Sentry project |
| `SIGN_IN_RATE_LIMIT_PER_MINUTE` | Password and two-factor code attempts per minute from one IP address, default 20 |
| `WEBHOOK_RESPONSE_TIMEOUT_MS` | How long a webhook waits for the workflow's response, default 25000 |
| `SANDBOX_MAX_OUTPUT_KB` | The most a Code node or one expression may return, in KB, default 1024 |
| `MAX_ITEMS_PER_NODE` | Items one node may process in a list, default 100 |
| `VECTOR_STORE_ENGINE` | Set to `app` to make the Vector Store compare embeddings in the app even when pgvector is installed |
| `WAIT_MAX_DAYS` | The longest a Wait node may wait, in days, default 7 (the limit of Inngest's free plan) |
| `FORM_RATE_LIMIT_PER_MINUTE` | Submissions per minute for one hosted form, default 30 |
| `CHAT_WIDGET_RATE_LIMIT_PER_MINUTE`, `CHAT_VISITOR_RATE_LIMIT_PER_MINUTE` | Messages per minute for one public chat widget, and for one visitor of it. Defaults 60 and 10 |
| `VISION_MAX_PDF_PAGES` | The most pages of a PDF one Analyze Image / Document node may read, default 20 |
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
| Old Office files | Extract from File cannot read the old .xls and .doc formats. (It also cannot read scanned PDFs, but the Analyze Image / Document node now can, with a vision model.) |
| Rendering PDF pages | Analyze Image / Document takes a scanned page's picture out of the PDF instead of drawing the page, so a page made only of vector drawings without text cannot be read. Drawing pages needs a canvas library on the server |
| Browser Automation | Deliberately not built: it needs a headless browser service that cannot run on standard serverless functions, and it is easy to abuse. If added, the plan is a node that uses the user's own hosted-browser API key |
| MongoDB, Redis, Supabase (REST) | More data stores next to Postgres and MySQL |
| Slack / Discord bots | Bot-token nodes and triggers; today both send through webhook URLs |

Also not built: a true n8n items model for every node from the trigger onward (items start at a list node), a real tokenizer for the Vector Store's token splitting, and the stdio / SSE transports for MCP.

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
* qrcode.react (the QR code for setting up two-factor authentication)

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
* disposable-email-domains-js (the list of throwaway email domains refused at sign-up)
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
