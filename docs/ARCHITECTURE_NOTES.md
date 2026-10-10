# RXJ architecture notes

Where the main parts of RXJ live and how they work, with an ownership audit of
every tRPC procedure and API route, and a list of security findings.

Written on 2026-10-08 from the working tree of branch
`task/0.1-architecture-notes`. Line numbers refer to that tree. It includes the
uncommitted DeepSeek / Kimi / Qwen node changes, so a few numbers in
`connected-model.ts`, `chat-model/executor.ts` and `agent/executor.ts` differ
slightly from the last commit.

This is a read-through of the code. Nothing here was verified by running the
app or attacking it.

## Contents

1. [Overview](#1-overview)
2. [Auth (Better Auth)](#2-auth-better-auth)
3. [Admin check (ADMIN_EMAILS)](#3-admin-check-admin_emails)
4. [Credential encryption](#4-credential-encryption)
5. [tRPC routers](#5-trpc-routers)
6. [Public API (/api/v1)](#6-public-api-apiv1)
7. [Webhook routes](#7-webhook-routes)
8. [File storage and download](#8-file-storage-and-download)
9. [Other API routes](#9-other-api-routes)
10. [Execution engine](#10-execution-engine)
11. [Expression engine](#11-expression-engine)
12. [AI Agent](#12-ai-agent)
13. [Outbound request guard (SSRF)](#13-outbound-request-guard-ssrf)
14. [Security findings](#14-security-findings)

---

## 1. Overview

| Layer | Technology | Entry point |
| ----- | ---------- | ----------- |
| Web app | Next.js 15 App Router, React 19 | `src/app` |
| Auth | Better Auth + Prisma adapter, Polar plugin | `src/lib/auth.ts` |
| Internal API | tRPC 11 (superjson) | `src/trpc`, `src/features/*/server/routers.ts` |
| Public API | Route handlers with API keys | `src/app/api/v1` |
| Database | Postgres through Prisma | `prisma/schema.prisma`, `src/lib/db.ts` |
| Background runs | Inngest functions | `src/inngest`, served at `src/app/api/inngest/route.ts` |
| Node logic | One executor per node type | `src/features/executions/lib/executor-registry.ts` |
| Templating | Handlebars + QuickJS (WebAssembly) | `src/features/executions/lib/templates.ts`, `expressions.ts` |

There is no `middleware.ts`. Every page and route protects itself.

A workflow run, end to end:

1. Something starts it: the editor (`workflows.execute`), the public API, a
   webhook route, or a cron function (schedule, Gmail, RSS).
2. The starter creates an `Execution` row with status `RUNNING` and sends the
   Inngest event `workflows/execute.workflow`.
3. The `execute-workflow` function loads the workflow, builds the graph and
   runs the nodes in order, calling one executor per node.
4. Each node writes an `ExecutionNode` row with its input and output. The run
   ends by writing the final context to `Execution.output`.

---

## 2. Auth (Better Auth)

| What | Where |
| ---- | ----- |
| Server config | `src/lib/auth.ts:96-246` |
| HTTP handler | `src/app/api/auth/[...all]/route.ts` (`toNextJsHandler(auth)`) |
| Browser client | `src/lib/auth-client.ts` |
| Page guards | `src/lib/auth-utils.ts` (`requireAuth`, `requireUnauth`) |
| tRPC guard | `protectedProcedure` in `src/trpc/init.ts:29-42` |

How it works:

- **Storage:** the Prisma adapter on Postgres (`auth.ts:97-99`). Better Auth
  owns the `User`, `Session`, `Account` and `Verification` models.
- **Sign-in methods:** email and password (`auth.ts:123-142`), GitHub and
  Google (`auth.ts:163-172`).
- **Email verification:** required only when `RESEND_API_KEY` is set and
  `REQUIRE_EMAIL_VERIFICATION` is not `"false"` (`auth.ts:45-47`). Mail is sent
  with Resend (`sendAuthEmail`, `auth.ts:50-91`).
- **Password reset:** one-hour token; a send failure is only logged so the
  form does not reveal which addresses exist (`auth.ts:130-141`).
- **Trusted origins:** built from `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_URL`,
  `TRUSTED_ORIGINS`, the Vercel URLs, and in development `localhost:3000` and
  `NGROK_URL` (`auth.ts:13-41`).
- **New users:** a database hook sets plan `FREE` and a 7-day trial
  (`auth.ts:101-119`).
- **Billing:** the Polar plugin adds checkout, portal and a webhook handler
  that syncs `User.plan` (`auth.ts:173-245`). That handler verifies Polar's
  signature with `POLAR_WEBHOOK_SECRET`. A second, separate Polar route does
  not (see finding 1).

Session checks in server code all call
`auth.api.getSession({ headers: await headers() })`:

- Dashboard pages call `requireAuth()`, which redirects to `/login`.
- `/billing` and `/pricing` are client pages with no server guard; their data
  comes from routes that check the session.
- API routes check the session themselves and answer 401.

---

## 3. Admin check (ADMIN_EMAILS)

| What | Where |
| ---- | ----- |
| `isAdmin` | `src/lib/admin.ts` |
| `adminProcedure` | `src/features/templates/server/routers.ts` |
| Startup warning | `getAdminVerificationWarning` in `src/lib/admin.ts`, logged from `src/instrumentation.ts` |

- `ADMIN_EMAILS` is a comma-separated list. Entries are trimmed and
  lower-cased, and compared with the signed-in user's email.
- The email must also be verified (`emailVerified === true`). Google and
  GitHub sign-ins arrive verified; a password account needs the verification
  mail, which needs `RESEND_API_KEY`. (Changed in task 1.1.)
- There is no role column in the database. Admin status is decided on every
  request from the session email.
- It is used in one place only: the workflow template gallery. Admins can
  publish, edit and delete templates and can see unpublished ones.
- The `getMany` response tells the client `isAdmin` so the UI can show the
  admin controls; the server enforces it separately.

Finding 4 describes the risk this had before the verified-email rule.

---

## 4. Credential encryption

| What | Where |
| ---- | ----- |
| `encrypt` / `decrypt` | `src/lib/encryption.ts` |
| Shared loader for executors | `loadCredentialSecret`, `src/features/executions/lib/integration.ts:11-42` |
| Model credential loader | `loadConnectedModel`, `src/features/executions/lib/connected-model.ts` |

How it works:

- *(Changed in task 1.5.)* `encryption.ts` writes `v1:` values: AES-256-GCM,
  random 12-byte IV, auth tag, key derived from `ENCRYPTION_KEY` with scrypt.
  It still reads the older Cryptr format, and reads with
  `ENCRYPTION_KEY_PREVIOUS` during a key rotation
  (`scripts/rotate-encryption-key.ts`).
- `Credential.value` always holds ciphertext. The plain value is a string: an
  API key, or JSON for SMTP, SSH, service accounts and OAuth tokens.

Where values are encrypted:

- `credentials.create` and `credentials.update`
  (`src/features/credentials/server/routers.ts:61`, `:105`).
- The Google and Salesforce OAuth callbacks
  (`src/app/api/oauth/google/callback/route.ts:114`,
  `src/app/api/oauth/salesforce/callback/route.ts:118`).

Where values are decrypted (server only, at the moment of use):

- `loadCredentialSecret` (`integration.ts:41`), used by most executors.
- Executors with their own lookup: OpenAI, Anthropic, Gemini, Notion, Email,
  Telegram, AI Agent (`agent/executor.ts:376`), `connected-model.ts:164`.
- `src/lib/google-oauth.ts:61`, `:98`, `src/lib/salesforce-oauth.ts:156`,
  `src/lib/telegram.ts:96`.

Two rules the code follows consistently:

- **Owner scoping:** every credential lookup I found in executors, triggers
  and libraries filters by `userId` as well as `id`. The one exception is the
  unused server action in finding 2.
- **No plain secrets in Inngest state:** the encrypted row is fetched inside
  `step.run`, and decryption happens outside the step or inside the step that
  makes the call, so the plain secret is not stored as a step result.

API keys for the public API are not encrypted; they are stored as a SHA-256
hash (section 6).

---

## 5. tRPC routers

| What | Where |
| ---- | ----- |
| Setup, `protectedProcedure`, `premiumProcedure` | `src/trpc/init.ts` |
| Root router | `src/trpc/routers/_app.ts` |
| HTTP handler | `src/app/api/trpc/[trpc]/route.ts` |
| Server-side caller and prefetch | `src/trpc/server.tsx` |

- `protectedProcedure` loads the Better Auth session and throws
  `UNAUTHORIZED` without one. The session is available as `ctx.auth`.
- Every procedure in the app is built on `protectedProcedure`. There are no
  public procedures.
- `premiumProcedure` (checks for an active Polar subscription) and
  `baseProcedure` are defined but not used by any router.
- `createTRPCContext` returns a placeholder `{ userId: 'user_123' }`
  (`init.ts:9-14`). Nothing reads it; identity always comes from `ctx.auth`.

### Ownership audit

*(Task 1.7: every lookup below now goes through `assertOwnership` in
`src/lib/ownership.ts`, which answers 404 for a record that is missing or
someone else's. Before, the tRPC procedures filtered by owner but answered
500 for a missing record. The line numbers in the tables are from before
that change.)*

"Owner check" means the query itself is filtered by the signed-in user's id,
so another user's record is "not found".

**workflows** (`src/features/workflows/server/routers.ts`)

| Procedure | Lines | Owner check |
| --------- | ----- | ----------- |
| `execute` | 18-164 | Yes: workflow loaded with `id` + `userId` (36-41) |
| `create` | 168-232 | Yes: created for the session user |
| `remove` | 235-244 | Yes: `id` + `userId` |
| `updateName` | 247-257 | Yes: `id` + `userId` |
| `setActive` | 262-294 | Yes: `id` + `userId` on both the lookup and the update |
| `update` | 297-387 | Yes for the workflow (324-329). No for each node's `credentialId` (finding 6) |
| `getOne` | 390-422 | Yes: `id` + `userId` |
| `getMany` | 426-479 | Yes: `userId` |

**credentials** (`src/features/credentials/server/routers.ts`)

| Procedure | Lines | Owner check |
| --------- | ----- | ----------- |
| `create` | 16-64 | Yes: created for the session user |
| `remove` | 68-77 | Yes: `id` + `userId` |
| `update` | 80-108 | Yes: `id` + `userId` |
| `getOne` | 111-117 | Yes: `id` + `userId` |
| `getMany` | 120-173 | Yes: `userId` |
| `getByType` | 174-190 | Yes: `userId` |

The three read procedures return the whole row, including the encrypted
`value` (finding 5).

**executions** (`src/features/executions/server/routers.ts`)

| Procedure | Lines | Owner check |
| --------- | ----- | ----------- |
| `retry` | 11-31 | Yes: `retryExecution` filters by `workflow.userId` (`retry.ts:24-27`) |
| `getOne` | 34-53 | Yes: `workflow.userId` |
| `getLatestData` | 56-94 | Yes: `workflow.userId` |
| `getMany` | 97-149 | Yes: `workflow.userId` |

**apiKeys** (`src/features/api-keys/server/routers.ts`)

| Procedure | Lines | Owner check |
| --------- | ----- | ----------- |
| `getMany` | 10-30 | Yes: `userId`; the hash is never selected |
| `create` | 33-65 | Yes: created for the session user; the key is returned once |
| `remove` | 67-75 | Yes: `id` + `userId` |

**templates** (`src/features/templates/server/routers.ts`)

| Procedure | Lines | Owner check |
| --------- | ----- | ----------- |
| `getMany` | 43-75 | Not applicable: templates are shared. Non-admins only see published ones |
| `use` | 78-177 | Not applicable for the template; the new workflow is created for the session user. Plan lock and workflow limit are enforced |
| `getSourceWorkflows` | 180-186 | Admin only; `userId` |
| `create` | 189-222 | Admin only; the source workflow is loaded with `id` + `userId` |
| `update` | 226-263 | Admin only; the source workflow is owner-checked. The template itself is not: any admin can edit any template |
| `remove` | 266-272 | Admin only; no owner check: any admin can delete any template |

Templates are stripped of private settings before they are stored
(`toTemplateData`, `template-data.ts:20-79`): `credentialId`, `secret`,
`signingSecret`, `verifyToken`, `appSecret`, `webhookUrl`, `workflowId`.

**Server action** (not tRPC): `getSmtpCredentials` in
`src/features/credentials/server/action.ts:6-15` has no session check and no
owner filter (finding 2).

---

## 6. Public API (/api/v1)

| What | Where |
| ---- | ----- |
| Key generation, hashing, request authentication | `src/lib/api-keys.ts` |
| Rate limiter | `src/lib/rate-limit.ts` |
| Key management UI backend | `src/features/api-keys/server/routers.ts` |

How key checking works (`authenticateApiRequest` in `api-keys.ts`; updated in
task 1.4). Every route passes the scope it needs:

1. The key is read from `Authorization: Bearer <key>` or `X-API-Key`.
2. A key that does not start with `rxj_` is rejected with 401.
3. The key is hashed with SHA-256 and the hash is looked up in
   `ApiKey.keyHash` (unique). No match: 401.
4. The key is rate-limited by its id (`API_RATE_LIMIT_PER_MINUTE`, default
   120). Over the limit: 429.
5. A key past its `expiresAt` is rejected with 401.
6. The owner must have API access: a plan with `features.apiAccess`, or an
   active trial (`hasApiAccess`). Otherwise 403.
7. The key's `scopes` must include the route's scope. Otherwise 403 naming
   the missing scope.
8. `lastUsedAt` is updated without waiting.

Keys are `rxj_` + 32 random bytes in hex. Only the hash and a short prefix are
stored. A user can have up to 10 keys. Scopes, expiry parsing and their
messages are in `src/lib/api-key-scopes.ts`.

### Routes

| Route | Method | Key check | Owner check |
| ----- | ------ | --------- | ----------- |
| `/api/v1/workflows` | GET | Yes | Yes: `userId` |
| `/api/v1/workflows/:id/execute` | POST | Yes | Yes: `id` + `userId` (`route.ts:25-26`); monthly limit enforced |
| `/api/v1/executions` | GET | Yes | Yes: `workflow.userId`; an optional `workflowId` filter is applied on top |
| `/api/v1/executions/:id` | GET | Yes | Yes: `workflow.userId` |
| `/api/v1/executions/:id/retry` | POST | Yes | Yes: through `retryExecution` |

`execute` runs the workflow from its manual trigger, with the JSON request
body as the starting variables, and answers 202 with the execution id.

---

## 7. Webhook routes

All are under `src/app/api/webhooks`. None uses a session: the caller is an
outside service. Shared helpers:

- `findTriggerNodes` (`src/inngest/utils.ts:111-122`) returns the workflow's
  trigger nodes of one type, and only when the workflow is active.
- `startWorkflowExecution` (`utils.ts:21-107`) creates the `Execution` row and
  sends the event. With a `dedupeKey` it first inserts a `WebhookDelivery`
  row; the unique index on `(workflowId, source, key)` stops a re-sent event
  from starting a second run.
- `secretsMatch` (`src/lib/webhook-security.ts:4-9`) is a constant-time
  comparison.
- `rateLimitResponse` limits each workflow's URL to
  `WEBHOOK_RATE_LIMIT_PER_MINUTE` (default 120).

| Route | Methods | How the caller is verified | Rate limit | Dedupe key |
| ----- | ------- | -------------------------- | ---------- | ---------- |
| `trigger/[workflowId]` | GET, POST, PUT, PATCH, DELETE | Per-node secret in `X-Webhook-Secret` or `?secret=` | Yes | `Idempotency-Key` header |
| `stripe?workflowId=` | POST | Stripe signature (HMAC-SHA256, 5-minute tolerance) with the node's signing secret | Yes | Stripe event id |
| `google-form?workflowId=` | POST | Per-node secret in `X-Webhook-Secret` or `?secret=` | Yes | `responseId` |
| `telegram/[workflowId]` | POST | `X-Telegram-Bot-Api-Secret-Token`, derived from `ENCRYPTION_KEY` and the workflow id | Yes | `update_id` |
| `typeform/[workflowId]` | POST | `Typeform-Signature` (HMAC-SHA256, base64) with the node's secret | Yes | `event_id` |
| `whatsapp/[workflowId]` | GET | `hub.verify_token` against the node's verify token | No | - |
| `whatsapp/[workflowId]` | POST | `X-Hub-Signature-256` with the node's app secret | Yes | message id |
| `polar` | POST | None (finding 1) | No | - |

Owner check: not applicable in the session sense. The workflow id in the URL
selects the workflow, and the secret or signature stored on that workflow's
trigger node authorises the call.

Details worth knowing:

- **Generic webhook:** the secret, `cookie` and `authorization` headers are
  removed before the request is put into the workflow data
  (`trigger/[workflowId]/route.ts:99-105`).
- **Waiting for a response:** when the trigger's Respond setting is not
  "immediately", the route polls the `Execution` row every 400 ms for up to
  `WEBHOOK_RESPONSE_TIMEOUT_MS` (default 25 s)
  (`src/lib/webhook-response.ts:80-155`). Responses built by a workflow get
  `Content-Security-Policy: sandbox` and `nosniff`, and cannot set cookies.
- **Telegram:** the bot's webhook is registered when the workflow is
  activated and removed when it is deactivated (`syncTelegramWebhooks`,
  `src/lib/telegram.ts:64-118`), called from `workflows.setActive` and
  `workflows.update`.

---

## 8. File storage and download

| What | Where |
| ---- | ----- |
| Save, load, limits, cleanup | `src/lib/workflow-files.ts` |
| Download route | `src/app/api/files/[fileId]/route.ts` |
| Daily cleanup function | `src/inngest/files-cleanup.ts` |
| File nodes | `src/features/executions/components/files` |

How it works:

- Files are stored in Postgres, in `WorkflowFile.data` (bytes). There is no
  object storage.
- Workflow data carries a small reference instead of the bytes:
  `{ id, fileName, mimeType, size, url }`.
- **Limits:** `MAX_FILE_SIZE_MB` (default 10) per file and
  `MAX_USER_STORAGE_MB` (default 200) per user (`workflow-files.ts:22-25`).
- **Names:** `sanitizeFileName` removes path separators and control
  characters and caps the length at 150.
- **Retention:** files older than `FILE_RETENTION_DAYS` (default 7) are
  deleted by a cron function at 03:17 every day. The same function deletes
  old `WebhookDelivery` rows.

| Route / function | Auth | Owner check |
| ---------------- | ---- | ----------- |
| `GET /api/files/:fileId` | A signed link (`expires` + `signature`, 15 minutes, `src/lib/file-links.ts`) or the session *(task 1.8)* | Signed link: no session needed. Otherwise yes: `assertOwnership` |
| `loadWorkflowFile` (used by nodes) | Runs inside a workflow | Yes: `id` + `userId` (`workflow-files.ts:124-126`) |

The download route always answers as an attachment, with `nosniff`,
`Content-Security-Policy: sandbox` and `no-store`, so a file made by a
workflow cannot run as a page on the app's origin.

---

## 9. Other API routes

| Route | Method | Auth | Owner check |
| ----- | ------ | ---- | ----------- |
| `/api/auth/[...all]` | GET, POST | Better Auth | Handled by Better Auth |
| `/api/trpc/[trpc]` | GET, POST | Per procedure | See section 5 |
| `/api/inngest` | GET, POST, PUT | Inngest SDK (signing key from the environment) | Not applicable |
| `/api/executions/:id/nodes` | GET | Session | Yes: `execution.workflow.userId` |
| `/api/realtime-token/:channel` | GET | Session | No: channels are global (finding 9) |
| `/api/onboarding/complete` | POST | Session | Yes: updates the session user |
| `/api/subscription/current` | GET | Session | Yes: reads the session user |
| `/api/subscription/checkout` | POST | Session | Yes: checkout is created for the session user |
| `/api/oauth/google/start` | GET | Session | Yes: state cookie stores the user id |
| `/api/oauth/google/callback` | GET | Session | Yes: state and user id must match the cookie |
| `/api/oauth/salesforce/start` | GET | Session | Yes: same pattern, plus PKCE |
| `/api/oauth/salesforce/callback` | GET | Session | Yes: same pattern |
| `/api/sentry-example-api` | GET | None | Not applicable (finding 13) |

OAuth flow for credentials (Google and Salesforce): the start route makes a
random `state`, stores it with the user id in an `httpOnly`, `sameSite=lax`
cookie scoped to the OAuth path for 10 minutes, and redirects to the
provider. The callback compares the state in constant time, checks the user
id, exchanges the code, and stores the refresh token as an encrypted
credential. The credential limit of the user's plan is enforced there too.

---

## 10. Execution engine

| What | Where |
| ---- | ----- |
| Inngest client | `src/inngest/client.ts` |
| Functions served | `src/app/api/inngest/route.ts` |
| Main function `execute-workflow` | `src/inngest/functions.ts:80-618` |
| Schedule heartbeat | `src/inngest/functions.ts:623-726` |
| Graph building and walking | `src/inngest/engine.ts` |
| Item lists (per-item runs) | `src/inngest/items.ts` |
| Event and trigger helpers | `src/inngest/utils.ts` |
| Executor registry | `src/features/executions/lib/executor-registry.ts` |
| Executor types | `src/features/executions/types.ts` |
| Pure-logic tests | `src/inngest/__test__/testCoreNodes.ts` |

### Inngest functions

| Function id | Trigger | What it does |
| ----------- | ------- | ------------ |
| `execute-workflow` | Event `workflows/execute.workflow` | Runs one execution from start to finish |
| `workflow-cron-heartbeat` | Cron, every minute | Starts active workflows whose Schedule trigger is due |
| `gmail-trigger-poll` | Cron, every minute | Checks Gmail for new mail for active Gmail triggers |
| `rss-trigger-poll` | Cron, every minute | Checks feeds for active RSS triggers |
| `workflow-files-cleanup` | Cron, daily | Deletes expired files and old webhook deliveries |

### What `execute-workflow` does

1. **Load the expression sandbox** (`functions.ts:174`), because rendering is
   synchronous.
2. **`init-execution`:** check the `Execution` row belongs to the workflow,
   and save the trigger and its starting data so the run can be retried.
3. **`prepare-workflow`:** load nodes, connections, owner id and plan.
4. **`check-monthly-execution-limit`:** stop if the owner is over the plan's
   monthly limit.
5. **Build the graph** (`buildGraph`, `engine.ts:72-148`). Nodes plugged only
   into a `sub-` port of an AI Agent, Text Classifier or Information
   Extractor are "supply" nodes: they are configuration, not steps. The rest
   is sorted topologically; a cycle is an error.
6. **Walk the graph** (`walk`, `engine.ts:290-417`). Execution starts at the
   trigger nodes matching the event's trigger. Only connections that were
   activated are followed, so IF, Switch, Filter and Text Classifier choose
   branches. Loop nodes drive their body once per item. Merge in "all" mode
   waits for every branch.
7. **Run each node** (`runNode`, `functions.ts:304-567`):
   - Plan-locked node types stop the run with an upgrade message.
   - An `ExecutionNode` row is created with the input context.
   - The executor is called once, or once per item after a list node
     (`runNodeForItems`).
   - "Retry On Fail": up to 5 tries with up to 5 s between them.
   - "On Error: Continue": the node is marked failed and the run goes on with
     `{{error.message}}` set.
   - Otherwise the node and execution are marked `FAILED`, Error Trigger
     workflows of the same user are started, and the function throws.
8. **`finalize-execution`:** status `SUCCESS`, the final context as output.

If the function itself fails, `onFailure` marks the execution `FAILED`
(`functions.ts:91-121`). Retries: 3 in production, 0 otherwise.

### Node executors

- An executor is `(params) => Promise<WorkflowContext>`. It receives the
  node's `data`, the shared `context`, `userId`, Inngest `step` tools, and the
  whole graph (`allNodes`, `connections`).
- It returns the context with its result added under the node's variable
  name. The context is one shared object for the whole run.
- `executorRegistry` maps every `NodeType` to its executor. Trigger nodes use
  executors that just pass the context on.
- Most integration nodes are generated from a config object
  (`createIntegrationNode`, `integration-dialog.tsx`) with their executors in
  `src/features/executions/components/apps`, `core`, `ai`, `data`, `files`.
- Work with side effects goes inside `step.run`, because Inngest replays the
  function body after every step.

### Plan limits

Enforced in several places: when starting a run (tRPC, API, retry), again
inside the function, per node type (`getRequiredPlanForNode`,
`src/config/plans.ts:135-156`), and for workflow, credential and API key
counts in their routers.

---

## 11. Expression engine

| What | Where |
| ---- | ----- |
| Rendering entry points | `src/features/executions/lib/templates.ts` |
| n8n-style expressions | `src/features/executions/lib/expressions.ts` |
| Code node sandbox | `src/features/executions/lib/code-sandbox.ts` |

Two syntaxes share the `{{ }}` braces:

- **Handlebars** for plain variables and helpers: `{{webhook.body.name}}`,
  `{{json items}}`.
- **n8n-style JavaScript** for anything using `$json`, `$input`, `$node`,
  `$now`, `$today`, `$execution`, `$workflow`, `$itemIndex`, `$('name')` or
  `$fromAI(...)` (`isN8nExpression`, `expressions.ts:39-43`).

How `renderTemplate` works (`templates.ts:124-167`):

1. If the text contains `$`, the n8n expressions are cut out and replaced by
   placeholders. A small scanner finds each expression's end, so braces and
   strings inside JavaScript are handled.
2. A `}}}` that ends JSON such as `{"a": {{json x}}}` is protected from
   Handlebars.
3. Handlebars compiles and renders what is left against the context.
4. The n8n expressions are evaluated and put back.

`renderTemplate` does not HTML-escape values. `renderEscapedTemplate` does,
for the nodes that always rendered that way.

Custom Handlebars helpers: `$fromAI` / `fromAI` (a value chosen by the AI
Agent), `shellQuote` (for the SSH node), `json`.

**n8n expressions** run in QuickJS compiled to WebAssembly, not in Node:

- A new runtime per render, with a 64 MB memory limit, a 128 KB stack, a
  1 s time limit per expression and a 1 MB limit on each result
  (`sandbox-limits.ts`, shared with the Code node). The memory limit is
  enforced by the maximum size of the engine's WebAssembly memory
  (`sandbox-engine.ts`): expressions share one engine, each Code node run
  makes its own.
- The context enters as a JSON string, never as a live object. A prelude
  defines `$json`, `$input`, `$node` and the rest (`expressions.ts:53-113`).
- No network, filesystem, timers or Node globals exist inside.
- The engine must be loaded before rendering; `execute-workflow` awaits
  `ensureExpressionEngine()` first.

**The Code node** uses the same sandbox and limits, with a time limit of
10 s by default that the node can raise to 60 s (`code-sandbox.ts`). User code is wrapped in an async function, gets
`context` (a JSON copy) and `console`, and returns a JSON-serialisable value.

---

## 12. AI Agent

| What | Where |
| ---- | ----- |
| Executor | `src/features/editor/components/agent/executor.ts` |
| Model loop | `src/features/editor/components/agent/agent-loop.ts` |
| Tool naming and schemas | `src/features/executions/lib/agent-tools.ts` |
| Model resolution | `src/features/executions/lib/connected-model.ts` |
| MCP client | `src/features/executions/components/ai/mcp.ts` |

The agent reads what is plugged into its ports (`executor.ts:103-133`):

| Port | Accepts | Used for |
| ---- | ------- | -------- |
| Chat Model | OpenAI, Anthropic, Gemini, DeepSeek, Kimi, Qwen, Chat Model | Provider, model name, credential |
| Memory | Memory node | Session id and window size |
| Tools | Any other node; MCP Client | Functions the model can call |
| Parser | Structured Output Parser | Forces a JSON answer |

Steps:

1. **Model** (`137-182`): the provider comes from the connected node's type;
   the credential is loaded with `id` + `userId`.
2. **Prompt** (`187-223`): from `chatInput` (or a webhook body) in "auto"
   mode, or from the Prompt field. A parser adds an instruction to answer in
   the given JSON shape.
3. **Memory** (`228-261`): the last N `AgentMemory` rows for
   `(nodeId, userId, sessionId)` become earlier chat messages.
4. **Tools** (`272-368`), see below.
5. **Run** (`374-412`): one step, `execute-agent-llm-loop`, decrypts the key,
   builds the model, connects MCP servers and calls `runAgentLoop`, which is
   `generateText` with the tools and a step limit (`maxIterations`, default
   10).
6. **Save memory** (`431-454`) and return `output`, token usage and, when
   asked, the intermediate steps.

### How tools are attached

- Every node on the Tools port whose type has an executor becomes one tool
  (`executor.ts:309-368`). There is no allow-list of node types.
- **Name and description:** from the agent's `toolSettings[nodeId]`, or
  defaults built from the node type (`agent-tools.ts:150-175`). Names are
  made unique and limited to what providers accept.
- **Input schema:** the node's settings are scanned for
  `{{$fromAI "key" "description" "type"}}`, `$fromAI('key', ...)` and
  `{{ai.key}}` (`extractAIParameters`, `agent-tools.ts:37-68`). Each key
  becomes a typed parameter. A node with none gets one optional `query`.
- **Execution:** when the model calls the tool, the node's normal executor
  runs with the context plus `ai: <the model's arguments>`, so those
  placeholders render to what the model chose.
- **Inline steps:** tools run inside the agent's own step, so they get an
  `inlineStep` whose `run` just calls the function (`272-283`).
- **Result:** only what the tool added to the context is returned to the
  model, cut at 20,000 characters. An error is returned as `{ error }` so the
  model can react.
- **MCP Client nodes** are different: the agent connects to the server
  (Streamable HTTP, through the SSRF guard), lists its tools and exposes each
  one (`buildMcpTools`, `mcp.ts:216`). `includeTools` can narrow the list.

Tools run as the workflow's owner: credentials, files and Execute Workflow
targets are all looked up with the owner's `userId`.

---

## 13. Outbound request guard (SSRF)

`src/lib/ssrf.ts` blocks requests to private, loopback, link-local and
reserved addresses unless `ALLOW_PRIVATE_NETWORK_REQUESTS=true`.

- `safeFetch` checks the URL, uses a connection agent whose DNS lookup is
  guarded (so the address is checked at connection time), and follows up to
  5 redirects by hand, checking each one.
- `assertPublicHost` is for non-HTTP clients (Postgres, MySQL).
- SSH has its own check with the same address list (`src/lib/ssh.ts:51-62`).

Used by: HTTP Request, Chat Model and its provider nodes, Vector Store
(compatible embeddings), MCP Client, Slack, Discord, Webhook Callback, RSS,
Postgres, MySQL, and the generic app-node HTTP helper. Not used by the Email
node (finding 11).

---

## 14. Security findings

Ordered by how much I would worry about them. Severity is my judgement from
reading the code.

### High

1. **The Polar webhook route accepts unsigned requests.**
   `src/app/api/webhooks/polar/route.ts:12-48`. Anyone can POST
   `{"type":"subscription.created","data":{"metadata":{"userId":"<id>"},"product_id":"<id>"}}`
   and set that user's plan. It needs a user id and a product id, neither of
   which is a secret by design. The Better Auth Polar plugin already handles
   signed webhooks (`src/lib/auth.ts:199-243`), so this route looks like a
   leftover that should be removed or given signature verification.

2. *(Fixed in task 1.7: the file is deleted.)*
   **`getSmtpCredentials` is an unauthenticated server action that lists
   every user's SMTP credentials.**
   `src/features/credentials/server/action.ts:6-15`. No session check and no
   `userId` filter. It returns ids and names only, not secrets, and nothing
   in `src` calls it, but an exported `'use server'` function can be invoked
   by any client that learns its action id. It should be deleted.

### Medium

3. **Polar plan changes are matched by email.**
   `src/lib/auth.ts:206-225` and `:232-238` update the user whose email
   equals the Polar customer's email, instead of the external customer id.
   If the two can differ, the wrong account is upgraded or downgraded. The
   same lines log customer emails (`:226`, `:238`).

4. **Fixed in task 1.1.** Admin rights depended only on an email match, and
   email verification can be off. `template-data.ts:150-159` with `auth.ts:45-47`. When
   `RESEND_API_KEY` is missing or `REQUIRE_EMAIL_VERIFICATION=false`, anyone
   who registers an address listed in `ADMIN_EMAILS` before its real owner
   does becomes an admin. Admins can publish templates that every user can
   install. `isAdmin` in `src/lib/admin.ts` now also requires
   `emailVerified`.

5. **Credential ciphertext is sent to the browser.**
   `src/features/credentials/server/routers.ts:111-117` (`getOne`),
   `:135-148` (`getMany`), `:183-188` (`getByType`) return full rows,
   including `value`. `update` relies on this: it compares the submitted
   value with the stored ciphertext to detect "unchanged" (`:98`). Only the
   owner receives it, and it is useless without `ENCRYPTION_KEY`, but the
   list and by-type queries have no need for it. Selecting only `id`, `name`,
   `type` and dates would remove the exposure.

6. *(Fixed in task 1.7: a node is only linked to a credential of the same
   user, `prepare-workflow` no longer joins credentials, connections must
   join nodes of the workflow being saved, and a node id already used by
   another workflow is refused. `node.type` is still not validated.)*
   **A node's `credentialId` is not checked against the owner when a
   workflow is saved.** `src/features/workflows/server/routers.ts:346`. The
   id is written as given. I found no path that turns this into reading
   another user's secret, because every executor looks credentials up with
   `userId`. Two side effects remain: `prepare-workflow` joins the credential
   without an owner filter and returns it as a step result
   (`src/inngest/functions.ts:225-229`), which puts ciphertext (possibly
   another user's) into Inngest's stored state for no purpose; and
   `node.type` is cast to `NodeType` without validation (`routers.ts:343`).

7. **Reduced in task 1.2.** Tools now have risk levels, dangerous tools
   are off unless the agent allows them, SSH `$fromAI` values are quoted
   automatically, tool calls are capped and tool results are marked as
   untrusted data (`agent-tools.ts`, `agent-loop.ts`,
   `agent-shell-quoting.ts`). The original finding:
   **Any node can be an AI Agent tool, with arguments chosen by the model.**
   `src/features/editor/components/agent/executor.ts:309-368`. SSH, Postgres,
   MySQL, HTTP Request, Execute Workflow and Email nodes can all be attached,
   and `$fromAI` values go into commands, SQL and URLs. The agent's prompt
   often comes from outside (Telegram, WhatsApp, webhooks), so this is a
   prompt-injection path to whatever the attached tools can do. The
   `shellQuote` helper exists for SSH but is opt-in. This is how n8n behaves
   too; it deserves a warning in the UI and docs at least.

8. **Webhook secrets are accepted in the query string.**
   `src/app/api/webhooks/trigger/[workflowId]/route.ts:65-68` and
   `src/app/api/webhooks/google-form/route.ts:45-48`. Secrets in URLs end up
   in access logs, proxies and browser history. The header form is already
   supported.

### Low

9. **Realtime channels are global, and any signed-in user can get a token.**
   `src/app/api/realtime-token/[channel]/route.ts:8`, `:34-37`. Channels such
   as `code-execution` are not scoped to a user or execution, so a subscriber
   would receive every user's messages, including Code node output
   (`src/features/executions/components/code/executor.ts:95-104`). In
   practice the engine does not pass `publish` to executors
   (`src/inngest/functions.ts:378-391`), so as far as I can see nothing is
   published today. It becomes a real leak the moment publishing is wired up.

10. *(API half fixed in task 1.4: the API limit is now counted per existing
    key, after the lookup, so made-up keys no longer insert rows. The webhook
    half below still stands.)* **The API rate limit does not slow key
    guessing, and the table grows without bound.** `src/lib/api-keys.ts:61-62` limits per hash of the
    presented key, so every wrong guess gets a fresh bucket. Each one also
    inserts a `rate_limit` row (`src/lib/rate-limit.ts:28-29`), as does every
    made-up workflow id on the webhook routes. Nothing deletes old rows. Keys
    are 256 random bits, so guessing is not realistic; the unbounded writes
    are the practical problem. Limiting by IP before the lookup, and cleaning
    old rows in the daily job, would fix both.

11. **The Email node connects to any SMTP host.**
    `src/features/executions/components/email/executor.ts:99-100`. The host
    from the SMTP credential is not passed through the SSRF guard, unlike the
    HTTP, database and SSH nodes, so it can point at internal addresses.

12. **The rate limiter fails open.** `src/lib/rate-limit.ts:54-58`. A
    database error lets every request through. That is a deliberate choice
    (the comment says so); it is listed so it stays a conscious one.

13. **`/api/sentry-example-api` is public and always throws.**
    `src/app/api/sentry-example-api/route.ts:12-17`. Anyone can use it to
    fill Sentry with errors. `/sentry-example-page` belongs to the same demo.

14. **The Telegram webhook secret falls back to an empty key.**
    `src/lib/telegram.ts:55`: `process.env.ENCRYPTION_KEY || ""`. Without the
    variable the secret is predictable from the workflow id. Credential
    encryption would already fail in that setup, so this is mostly about
    failing loudly instead.

15. **Workflow errors are returned to webhook callers.**
    `src/lib/webhook-response.ts:110-117` sends `execution.error` to whoever
    called the webhook. Node error messages can contain internal detail such
    as upstream API responses.

16. **The WhatsApp verification GET is not rate-limited.**
    `src/app/api/webhooks/whatsapp/[workflowId]/route.ts:19-44`. The POST
    handler is.

17. *(Fixed in task 1.5: values carry a version, `ENCRYPTION_KEY_PREVIOUS`
    is supported and `scripts/rotate-encryption-key.ts` re-encrypts.)*
    **One encryption key with no rotation path.** `src/lib/encryption.ts:3`.
    Ciphertexts carry no key version, so changing `ENCRYPTION_KEY` makes every
    stored credential unreadable.

18. **Handlebars templates are compiled in the server process.**
    `src/features/executions/lib/templates.ts:146`. Unlike n8n-style
    expressions, they do not run in the sandbox and have no time limit. This
    relies on Handlebars' own protections against prototype access; a very
    large or deeply nested template can also hold the worker.

19. **Run data is kept in full and without an expiry.**
    `src/inngest/functions.ts:337`, `:557`, `:601` store the whole context as
    each node's input and output and as the execution output. That includes
    request bodies and anything a node returned. Only files and webhook
    deliveries have a retention job.

### Not security, but found on the way

- `src/app/api/subscription/checkout/route.ts:11` hard-codes
  `server: "sandbox"` for Polar, so that route creates sandbox checkouts in
  production too.
- `next.config.ts:6-13` ignores TypeScript and ESLint errors during builds,
  so `tsc --noEmit` is the only type check.
- `src/trpc/init.ts:9-14` still has the tutorial context
  (`userId: 'user_123'`); `premiumProcedure` is unused.
- Google credentials request full Drive access
  (`src/lib/google-oauth.ts:21`).

### Checked and found sound

- Every tRPC procedure requires a session, and every record lookup is
  filtered by owner (section 5).
- All `/api/v1` routes authenticate the key and filter by its owner.
- Credential lookups in executors, triggers and libraries filter by
  `userId`; plain secrets are not written to Inngest step results.
- No log statement prints a credential, token or API key value that I could
  find.
- Stripe, Typeform, WhatsApp and Telegram webhooks verify a signature or
  secret in constant time; Stripe also rejects old timestamps.
- File downloads are owner-scoped and forced to be attachments.
- OAuth credential flows use a random state bound to the user in an
  `httpOnly` cookie; Salesforce also uses PKCE.
- User JavaScript (Code node and expressions) runs in QuickJS/WebAssembly
  with memory and time limits, not in Node's `vm`.
- Execute Workflow only runs workflows of the same owner and stops at 5
  levels of nesting.
- API keys are stored as SHA-256 hashes and shown once.
