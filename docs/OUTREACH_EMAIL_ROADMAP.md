# RXJ — Future Updates

Status: **planned, not started.** Nothing in this file is built yet.

This file holds two lists:

* **Part 1: Launch readiness (L1–L5).** Work that makes RXJ safe for real paying customers. **Do this first.**
* **Part 2: Outreach and email automation (B1–B10).** New platform features for outreach agents. Do these after launch, or when customers ask for them.

**How to use this file with Claude Code:** start a session with your usual setup prompt, then:

> Read `docs/FUTURE_UPDATES.md` and do **Task L1** only. When finished, tick its checkbox, update README.md and docs/TESTING.md where relevant, then stop.

Do one task per session, review it, merge it, then start the next.

---

## Summary

| Task | Feature | Priority | Effort |
| ---- | ------- | -------- | ------ |
| **L1** | Separate production, preview and development databases | **Critical** | Small–medium |
| **L2** | Integration tests with a real database in CI | Critical | Medium–large |
| **L3** | Code node sandbox off the main thread | High | Medium |
| **L4** | Privacy controls: data export, account deletion, memory facts | High | Medium |
| **L5** | Security leftovers (SSO secrets, Better Auth upgrade, passkeys, CSP) | High | Medium |
| B1 | Google Sheets read/update | Must-have | Small–medium |
| B2 | IMAP Trigger and IMAP node | Must-have | Medium |
| B3 | SMTP headers and threading; Gmail returns IDs | Must-have | Small |
| B4 | Per-item approval and "Approve with edits" | Must-have | Medium–large |
| B5 | Delay: random delay and sending window | Should-have | Small |
| B6 | Data Table node | Should-have | Medium |
| B7 | Mailbox rotation | Should-have | Small–medium |
| B8 | Text Formatter URL and email helpers | Should-have | Small |
| B9 | Hunter.io, DataForSEO, ZeroBounce / NeverBounce nodes | Nice-to-have | Small each |
| B10 | Link Checker | Nice-to-have | Small |

---

# Part 1 — Launch readiness

## [ ] L1 — Separate production, preview and development databases

**Problem:** local development and Vercel preview deployments use the same database as the live app. A bug on a laptop or in an unmerged branch can change or delete customer data, and anyone with the local `.env` has production access.

1. Use Neon branching:
   * production stays on the main branch;
   * create a "dev" branch for local development;
   * Vercel preview deployments use their own Neon branch (Neon's Vercel integration can create one per preview).
2. Update `scripts/migrate-on-deploy.mjs` so each build migrates only its own database:
   * preview builds migrate their preview database, never production;
   * production builds migrate production only.
3. `.env.example` points to a dev database. Add a startup check that refuses to run `npm run dev` when `DATABASE_URL` matches the production host (`PRODUCTION_DATABASE_HOST` env var).
4. Dev and preview databases use a different `ENCRYPTION_KEY` from production and contain no copies of production credentials.
5. Document the setup in README.md (Deploying section).

**Done when:** no local or preview build can connect to the production database.

## [ ] L2 — Integration tests with a real database in CI

**Problem:** CI only runs tests that need no database, so a change in one place can break another without anyone noticing.

1. Add a Postgres service container to `.github/workflows/ci.yml`, run `prisma migrate deploy` against it, and run integration tests (Vitest, or the existing tsx style).
2. Cover the critical paths:

   | Area | What to test |
   | ---- | ------------ |
   | Sign-in | Sign-up and sign-in with 2FA |
   | Executions | Create workflow → execute → execution saved and redacted |
   | Webhooks | Trigger with secret; duplicate delivery runs once |
   | Pauses | Wait node resume and timeout; approval approve/reject |
   | Teams | A viewer cannot edit; a member cannot see credential values |
   | API | API key scopes |
   | Isolation | Move `scripts/test-tenant-isolation.ts` into this suite |
   | Limits | AI credits hard stop; daily message caps |
   | Regression | `scripts/test-backlink-agent.ts` |

3. Mock external providers (AI models, email, WhatsApp) with a local HTTP mock server, so tests need no real keys. Reuse the approach of `scripts/test-backlink-agent.ts`.
4. Add a Playwright smoke test: log in, open the editor, add a Manual Trigger and a Set Variable node, run it, and see success.

**Done when:** every pull request runs these tests against a real database, and a failure blocks the merge.

## [ ] L3 — Run the Code node sandbox off the main thread

**Problem:** a Code node runs on the server's main thread for up to 60 seconds and holds up every other request on that server for that long.

1. Run Code node executions in a worker thread pool (`node:worker_threads`, for example piscina), with the same memory, stack, time and output limits.
2. A worker that exceeds its time is terminated (`worker.terminate()`), not just interrupted.
3. Keep expressions (1-second limit) on the main thread only if measurements show the worker overhead is too high, and report the numbers.
4. Limit concurrent sandbox runs per user so one account cannot take all workers.

**Done when:** a Code node running its full timeout does not slow down other users' requests.

## [ ] L4 — Privacy controls

**Problem:** memory facts and summaries have no screen to view or delete, and there is no data export or account deletion. Laws such as GDPR require both.

1. **Settings → Your data:** export everything the account owns as a ZIP of JSON: workflows, executions within retention, memory facts and summaries, chatbot sources and the audit log. Never include credential values.
2. A page listing memory facts and summaries by contact, with delete per contact and "delete all".
3. **Account deletion:**
   * confirm with password or 2FA;
   * cancel the Polar subscription;
   * delete all the account's data, including Vector Store collections, stored files and memory;
   * record the deletion in a server log without personal data.
4. Website widget conversations: an action to delete one visitor's conversation.

**Done when:** a user can export and delete their data without contacting support.

## [ ] L5 — Security leftovers

These are gaps the README itself lists.

1. **SSO client secrets** are stored by the SSO plugin unencrypted. Encrypt them with the same AES-256-GCM format (`v1:`) if the plugin allows a custom adapter or hook. If it doesn't, document the limitation and restrict database access.
2. **Better Auth:** upgrade the pinned Better Auth packages together to 1.7.7 or later (check the changelog for breaking changes), then enable SAML, which is blocked until that version.
3. **Passkeys:** install `@better-auth/passkey` and add passkeys to Settings.
4. **CSP:** review the Content-Security-Policy reports collected in Sentry, tighten the policy, and switch from report-only to enforced.
5. **Dependencies:** run `npm audit` and fix anything high or critical.

**Done when:** every item is either fixed or documented with the reason it can't be.

## Launch checklist (not code)

- [ ] Neon point-in-time restore is on for production, and a restore has been practised once.
- [ ] `ENCRYPTION_KEY` is stored safely outside Vercel. Losing it loses every stored credential.
- [ ] External penetration test before launch.
- [ ] Legal pages: terms of service, privacy policy, and a data processing note. The note matters most for Chinese model providers and for WhatsApp data.
- [ ] Status page and uptime monitoring; alerts on failed Inngest runs.
- [ ] Load test: how many webhook runs and chat messages per minute before Inngest or the database becomes the limit.
- [ ] Pricing check: plan prices cover the cost of included AI credits and executions.

---

# Part 2 — Outreach and email automation

**Why:** these features let RXJ users build outreach agents, such as AI backlink outreach, cold email follow-ups and lead nurturing, without workarounds. Today such an agent works only with Airtable or Postgres as the prospect list, a Loop to space out emails, and Gmail as the only mailbox for replies. That was proven by `scripts/test-backlink-agent.ts`.

## Compliance note

Cold outreach should use Gmail or SMTP mailboxes on a separate sending domain, not the main one. Resend's and SendGrid's policies generally forbid unsolicited email. Every outreach email should identify the sender honestly and include an opt-out line, and outreach must follow CAN-SPAM and GDPR. Templates and docs for these features should say this.

## [ ] B1 — Google Sheets: read and update operations

Works with both credential types (Google account and service account).

1. New operations:
   * **Get Rows**: optional filter (column; operator equals / contains / is empty / is not empty; value) and optional max rows.
   * **Lookup Row**: the first row where a column equals a value.
   * **Update Row**: by row number, or by a lookup column and value.
   * **Append or Update**: upsert by a key column.
   * **Delete Row**: by row number.
2. The first row is the header. Rows are returned as objects keyed by header, with their row number as `_row`.
3. Get Rows returns a list so Split Out and per-item execution work, plus `{{<name>.count}}`.
4. Values support expressions. Update changes only the columns given.
5. As AI Agent tools, Get and Lookup are read, Append and Update are write, and Delete is dangerous.
6. Tests cover header mapping, filtering and upsert logic.

## [ ] B2 — IMAP Trigger and IMAP node

1. **IMAP credential:**
   * host, port, TLS (on / STARTTLS / off), username, and password or app password;
   * the host goes through the SSRF guard, and a private host must be in `PRIVATE_NETWORK_ALLOWLIST`.
2. **IMAP Trigger:**
   * polls a folder every 1, 5, 15 or 60 minutes, like the Gmail Trigger, with an optional IMAP search filter;
   * reports only new messages, with a duplicate check by Message-ID for 7 days;
   * marks a message as seen only after it started a run, the same rule as the fixed Gmail Trigger.
3. **IMAP node:** Search, Get Message, Mark as Read / Unread, Move to Folder.
4. **Output per message:**
   * `from`, `to`, `cc`, `subject`, `date`, `text`, `html`, `messageId`, `inReplyTo`, `references`;
   * attachments as file variables, with the same file limits as other nodes.
5. Use a maintained library (for example imapflow and mailparser) and close the connection after each poll.
6. Tests cover parsing and duplicate detection.

## [ ] B3 — Email (SMTP) and Gmail: headers and threading

1. **SMTP headers:**
   * a **Custom Headers** field (key/value list, supports expressions);
   * it may not override From, To, Cc, Bcc, Subject, Content-Type or Message-ID;
   * document how to add `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
2. **SMTP threading:** a **Reply To Message ID** option sets `In-Reply-To` and `References`, and adds "Re: " to the subject when it is missing. When replying to our own sent message, the reply goes to the original recipient, the same rule as the fixed Gmail Reply.
3. SMTP and Gmail send/reply return the sent `messageId`, and Gmail also returns `threadId`. Check what Gmail already returns and add only what is missing.
4. Existing nodes keep working unchanged.
5. Tests cover header validation.

## [ ] B4 — Per-item approval and "Approve with edits"

1. Form fields get an optional **Default Value** (supports expressions). This is useful on its own too.
2. **Ask for each item** on Send and Wait for Approval:
   * off by default, so existing workflows keep asking once per list;
   * when on, each item gets its own request and continues through Approved or Rejected on its own.
3. **Allow edits:**
   * a list of editable fields (name, label, value expression, single or multi-line);
   * the approval page shows them pre-filled, and the person can change them before approving;
   * edited values come back as `{{approval.edited.<field>}}`, and fields left unchanged keep their value.
4. Keep the same signed, single-use, expiring links and confirmation page as today. Edited text is always treated as plain text.
5. At most `MAX_ITEMS_PER_NODE` requests per run.
6. Tests cover per-item routing and edited values.

## [ ] B5 — Delay node: random delay and sending window

The test run confirmed that today Delay is in `RUN_ONCE_TYPES` (`src/inngest/items.ts`): after a list node it pauses once for the whole list. The workaround is a Loop with a Delay inside.

1. **Random Delay:** a min and max (seconds or minutes). After a list node, items are spaced out one after another, each by its own random delay. This needs the engine to run the following nodes per item before moving on, not all items through one node first; design it so other nodes are unaffected.
2. **Sending Window:** days of week, start and end hour, and time zone. Items outside the window wait until it opens.
3. Use Inngest sleep steps so no request is held open, and respect `WAIT_MAX_DAYS`.
4. Tests cover the window calculation, including time zones and overnight windows. Check b5 of `scripts/test-backlink-agent.ts` should then pass.

## [ ] B6 — Data Table node

A small built-in table for workflow state, for example a suppression list or "already contacted" checks, so users don't need Airtable or Postgres.

1. **Storage:**
   * a new Prisma model holding a named table per workspace, with rows of key, JSON value and timestamps;
   * the key is unique per table;
   * the migration only adds.
2. **Operations:**
   * Add (or update) Row, Check Exists, Get Row, Remove Row;
   * List Rows: filter by key prefix, max rows, returns a list for Split Out.
3. **Settings → Data Tables page:**
   * lists tables and rows, deletes rows, exports as CSV;
   * follows workspace roles: a Viewer can see, an Editor can change.
4. **Limits:**
   * the number of tables and rows per plan, in one config file;
   * keys up to 255 characters, values up to 10 KB.
5. As AI Agent tools, Check, Get and List are read, Add is write, and Remove is dangerous.
6. Data Tables are included in the L4 data export and account deletion.
7. Tests cover the operations and limits.

## [ ] B7 — Mailbox rotation for Gmail and SMTP

1. A **Rotate between credentials** option: a list of credentials of the same type, with mode Round Robin or Least Used Today.
2. A per-mailbox daily limit (default 30), separate from the plan's daily cap:
   * a mailbox at its limit is skipped;
   * when every mailbox is full, the node fails with a clear message.
3. The output names the credential that was used, never its secret.
4. Counts are stored per credential per day (UTC).
5. Tests cover the selection logic.

## [ ] B8 — Text Formatter: URL and email helpers

1. New operations:
   * **Extract Domain**: `https://blog.site.co.uk/post` → `site.co.uk`, using a public-suffix list package;
   * **Extract Root URL**;
   * **Find Emails in Text**: returns a list, deduplicated, ignoring image filenames such as `logo@2x.png`;
   * **Normalize Email**: trim and lowercase.
2. All of them work per item after list nodes.
3. Tests cover each operation, including tricky domains and obfuscated emails.

## [ ] B9 — Integration nodes: Hunter.io, DataForSEO, ZeroBounce / NeverBounce

Built with the `createIntegrationNode` pattern. Until then, the HTTP Request node with the `HTTP_QUERY_AUTH` credential works.

1. **Hunter.io:** Domain Search, Email Finder, Email Verifier (API key credential).
2. **DataForSEO:** SERP results (Google organic), Backlinks of a domain, Domain metrics (`login:password`, Basic auth).
3. **ZeroBounce** and **NeverBounce:** Verify Email (API key credentials).
4. Keys are sent the way each API requires and are always redacted from stored logs; add their key shapes to the redaction patterns if needed.
5. All are read tools for AI Agents, and lists return items for Split Out.
6. Add the credential types to the README credential table.

## [ ] B10 — Link Checker

1. Add a "Check for link to domain" operation to the HTTP Request node, or a small dedicated node, whichever fits the code better.
2. Fetch the raw HTML through the SSRF guard, with the same size and time limits as Read Web Page. Search every `<a>` tag, including nav, header, footer and sidebar, for links to the domain or its subdomains.
3. Return `found`, `count`, and for each link `href`, `anchorText` and `rel` (nofollow / sponsored / ugc).
4. Tests use sample HTML.

## Afterwards (optional)

Once B1–B10 are done, consider a gallery template **"AI Backlink Outreach"** that uses them:

* four workflows: prospecting, sending, replies and follow-ups, link checking;
* a test mode that sends only to your own address;
* the compliance note above.

---

## Progress log

| Task | Status | PR / branch | Notes |
| ---- | ------ | ----------- | ----- |
| L1 | | | |