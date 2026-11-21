# Support messages and the admin dashboard: plan

Agreed with the owner on 2026-11-21. Support is about problems **on the
platform**: customers building and running workflows in RXJ (nodes,
connections, runs), not their own servers.

## Decisions

* **Support email:** the one on the Contact page (`LEGAL.email` in
  `src/features/marketing/lib/legal-content.ts`). `SUPPORT_EMAIL` can
  override it.
* **Two ways to reach the owner:** email the support address (answered
  from the owner's own inbox, outside RXJ), or send a message from inside
  RXJ (answered in the admin dashboard).
* **Replies to in-app messages:** shown to the customer under **My
  messages** in RXJ, and emailed to them too.
* **Errors page:** yes, per customer, with details.

## Step 1: customers send messages (migration)

* **Sidebar → Support** (`/support`): the support email (copy, "Write an
  email"), a **Send a message** button, and **My messages** with their
  status and the owner's replies.
* **Workflow editor top bar → Help**: the same popup, with the workflow
  (and the selected node, if any) attached and shown to the customer.
* **The popup:** title (up to 120 characters), message (up to 5,000),
  name and email (from the account, editable). "Thanks, we will reply to
  <email>." At most 5 messages an hour per account.
* **The owner is emailed** about each new message.
* **Tables:** `support_message` (user, name, email, title, message,
  workflow, node, page, status `new` / `in_progress` / `resolved`,
  times) and `support_reply` (message, admin, text, time). Additive.

## Step 2: admin area and support inbox (no migration)

* `/admin`, in the sidebar only for admins (verified address in
  `ADMIN_EMAILS`); changing anything also needs two-factor.
* **Overview:** new messages (highlighted), accounts, sign-ups this week,
  active workflows, runs this month, failed runs in the last 24 hours.
* **Support inbox:** newest first, filter by status. A message shows the
  customer, the workflow and node, and **read-only workflow details**
  (its nodes, and its last failed run's error and failing node).
  **Reply** (shown in My messages, emailed to the customer) and change
  the status.

## Step 3: customers (index migration)

* Every account: workflows created, active workflows, runs this month,
  failed runs this month, sign-up date, last sign-in, open messages.
  Searchable, busiest first.
* The managed servers fleet page moves to `/admin`.
* An index on executions by status and time for the counts.

## Step 4: errors

* Failed runs of the last 24 hours / 7 days, **per customer**: who, which
  workflow, which node, the error message, when, how often. Click a row
  for the run's details (failing node, error, the run's other nodes).
* Grouped view as well: the same node and error across customers
  ("Gmail: invalid_grant, 14 runs, 6 customers").
* A link to Sentry for crashes of the app itself.

## Privacy

* A support message is stored so the owner can answer it. The privacy
  policy gets a sentence saying so.
* The admin's read-only views show node names, types and error messages
  (already cleaned of known secret shapes), never credential values.

## Rules

Each step is its own task branch and PR. Migrations are created with
`prisma migrate dev --create-only` after a clean `prisma migrate status`,
and their SQL is shown to the owner before anything touches the database
(CLAUDE.md).
