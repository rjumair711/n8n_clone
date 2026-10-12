// Runs the four AI Backlink Outreach workflows (prospecting, sending,
// replies and follow-ups, link checker) through the real execution engine
// against a local mock of every outside service, and prints PASS or FAIL
// for each thing the agent has to get right.
//
//   DATABASE_URL=postgresql://user:pass@localhost:5432/rxj_test \
//     npx tsx --conditions=react-server scripts/test-backlink-agent.ts
//
// DEVELOPMENT DATABASE ONLY. The script does not read .env (the database
// there is the live one) and refuses to start when DATABASE_URL is missing,
// is the database of .env, or is not on this machine. A development
// database on another host has to be named: --dev-db-host=<host>. The
// database needs all migrations applied.
//
// What it does there: creates one temporary user (its email ends in
// @backlink-test.invalid) with credentials and four workflows, runs them,
// and deletes the user and everything it owns when it finishes, also when
// a check fails.
//
// Nothing leaves this machine. Web Search (Tavily), Airtable and Gmail have
// fixed addresses in their nodes, so requests to those hosts are redirected
// to the mock server inside this process; every other outside request is
// refused. The nodes whose address is a setting (HTTP Request, Chat Model,
// Read Web Page) are pointed at the mock server, which is allowed through
// PRIVATE_NETWORK_ALLOWLIST for this process only.

import dns from "node:dns";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { http as intercept, bypass } from "msw";
import { setupServer } from "msw/node";

// =========================================================================
// 1. THE DATABASE MUST BE A DEVELOPMENT ONE
// =========================================================================
// Before anything of the app is loaded: the Prisma client would read .env
// by itself when DATABASE_URL is not set.

const HOSTED_DATABASE =
  /neon\.tech|supabase\.|amazonaws\.com|azure\.com|render\.com|railway\.app|vercel|planetscale|aivencloud|cockroachlabs|digitalocean|pooler/i;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const databaseOf = (value: string) => {
  const url = new URL(value.trim().replace(/^["']|["']$/g, ""));

  return { host: url.hostname.toLowerCase(), name: url.pathname };
};

const getDatabaseProblem = (): string | null => {
  const value = process.env.DATABASE_URL;

  if (!value) {
    return "DATABASE_URL is not set. It is not read from .env, because that is the live database: pass a development database on the command line.";
  }

  let target: { host: string; name: string };
  try {
    target = databaseOf(value);
  } catch {
    return "DATABASE_URL is not a valid URL.";
  }

  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
    return "This is a production environment (VERCEL_ENV or NODE_ENV).";
  }

  if (HOSTED_DATABASE.test(target.host)) {
    return `DATABASE_URL points at a hosted database (${target.host}), which looks like production.`;
  }

  const envFile = path.join(process.cwd(), ".env");
  if (fs.existsSync(envFile)) {
    const line = fs
      .readFileSync(envFile, "utf8")
      .split(/\r?\n/)
      .find((entry) => /^\s*DATABASE_URL\s*=/.test(entry));

    try {
      const live = line ? databaseOf(line.slice(line.indexOf("=") + 1)) : null;

      if (live && live.host === target.host && live.name === target.name) {
        return "DATABASE_URL is the database of .env, which the live app uses.";
      }
    } catch {
      // An unreadable line in .env is not this script's problem
    }
  }

  const named = process.argv
    .find((arg) => arg.startsWith("--dev-db-host="))
    ?.slice("--dev-db-host=".length)
    .toLowerCase();

  if (!LOCAL_HOSTS.has(target.host) && named !== target.host) {
    return `DATABASE_URL is not on this machine (${target.host}). If it is a development database, say so with --dev-db-host=${target.host}`;
  }

  return null;
};

// =========================================================================
// 2. THE MOCK SERVER
// =========================================================================
// One HTTP server that stands in for every outside service. Web pages are
// told apart by the Host header; the APIs by the first part of the path.

const OUR_DOMAIN = "ourgardenshop.com";
const MAILBOX = "outreach@ourgardenshop-mail.com";
const BASE_ID = "appBacklinkTest";

const KEYS = {
  tavily: "tvly-test-key",
  airtable: "pat-test-key",
  hunter: "hunter-test-key",
  zeroBounce: "zb-test-key",
  model: "sk-test-key",
  googleAccess: "ya29.test-access-token",
};

type Site = { host: string; path: string; title: string; relevant: boolean };

// The five new pages of the search: three about gardening, two not
const NEW_SITES: Site[] = [
  { host: "greenthumbdaily.test", path: "/best-garden-tools", title: "Best Garden Tools for Small Spaces", relevant: true },
  { host: "cryptocasinonews.test", path: "/bonus-codes", title: "Casino Bonus Codes This Week", relevant: false },
  { host: "backyardharvest.test", path: "/resources", title: "Backyard Harvest Growing Resources", relevant: true },
  { host: "cheapflightsdeals.test", path: "/deals", title: "Cheap Flight Deals", relevant: false },
  { host: "urbanveggiepatch.test", path: "/useful-links", title: "Urban Veggie Patch Useful Links", relevant: true },
];
// Also in the search results, and about gardening, so only the "already in
// the table" and "suppressed" checks can keep them out
const EXISTING_SITE: Site = { host: "alreadylisted.test", path: "/garden-links", title: "Already Listed Garden Links", relevant: true };
const SUPPRESSED_SITE: Site = { host: "donotcontact.test", path: "/garden-blogroll", title: "Do Not Contact Garden Blogroll", relevant: true };
const ALL_SITES = [...NEW_SITES, EXISTING_SITE, SUPPRESSED_SITE];

type AirtableRecord = { id: string; createdTime: string; fields: Record<string, unknown> };

type MockMessage = {
  id: string;
  threadId: string;
  labelIds: string[];
  internalDate: number;
  headers: Record<string, string>;
  text: string;
};

type TimelineEntry =
  | { kind: "email"; to: string; threadId: string; messageId: string; subject: string }
  | { kind: "sleep"; duration: string };

const mock = {
  port: 0,
  // Emails sent and pauses taken, in the order they happened
  timeline: [] as TimelineEntry[],
  pageFetches: [] as string[],
  // Every list request to Airtable: "<table>@<first record of the page>"
  airtablePages: [] as string[],
  // Which prospects' pages link to us: "body" or "footer"
  links: new Map<string, "body" | "footer">(),
  tables: new Map<string, AirtableRecord[]>(),
  messages: new Map<string, MockMessage>(),
  counter: 0,
  // Requests the mock could not answer: a mistake in a workflow or the test
  unexpected: [] as string[],
};

const table = (name: string) => {
  if (!mock.tables.has(name)) mock.tables.set(name, []);
  return mock.tables.get(name)!;
};

const addRecord = (tableName: string, fields: Record<string, unknown>) => {
  const record = {
    id: `rec${String(++mock.counter).padStart(6, "0")}`,
    createdTime: new Date().toISOString(),
    fields,
  };
  table(tableName).push(record);
  return record;
};

const siteUrl = (site: Site) => `http://${site.host}:${mock.port}${site.path}`;

// ------------------------------------------------------------- web pages
const paragraphs = (site: Site) =>
  site.relevant
    ? [
        "Growing your own vegetables in a small garden is easier than most people think, and the right tools make the work lighter.",
        "We tested trowels, pruners and compost bins over a full season in raised beds and on a balcony garden.",
        "A good hand trowel, a sharp pair of pruners and a sturdy watering can cover nearly every job in a vegetable patch.",
        "Compost is the cheapest way to improve garden soil, and a closed bin keeps it tidy in a small space.",
      ]
    : site.host.includes("casino")
      ? [
          "This week brings new bonus codes for slots and live roulette at several online casinos.",
          "Wagering requirements differ between sites, so read the terms before you deposit.",
          "Our editors list the welcome offers with the lowest playthrough and the fastest payouts.",
          "Remember that betting is a paid entertainment and never a way to earn money.",
        ]
      : [
          "Airlines released a new batch of low fares for spring travel between Europe and Asia.",
          "Booking on a Tuesday is not cheaper than any other day, whatever the old advice says.",
          "Set a fare alert for your route and be flexible by a day or two to save the most.",
          "Budget carriers charge for cabin bags, so add that to the price before you compare.",
        ];

const pageHtml = (site: Site) => {
  const link = mock.links.get(site.host);
  const anchor = `<a href="https://www.${OUR_DOMAIN}/guides/raised-beds">a guide to raised beds</a>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${site.title}</title></head>
<body>
<nav class="navbar"><a href="/">Home</a> <a href="/about">About</a></nav>
<article>
<h1>${site.title}</h1>
${paragraphs(site).map((text) => `<p>${text}</p>`).join("\n")}
${link === "body" ? `<p>For building your own beds we recommend ${anchor}.</p>` : ""}
</article>
<footer class="footer"><p>Copyright ${site.host}.${link === "footer" ? ` Partners: ${anchor}` : ""}</p></footer>
</body></html>`;
};

// ------------------------------------------------------- Airtable formulas
// The part of Airtable's formula language the workflows use: {field},
// 'text', numbers, = != < >, AND, OR, NOT, NOW, DATEADD and IS_BEFORE.
// Anything else is answered like Airtable answers a formula it cannot read.

class FormulaError extends Error {}

const evaluateFormula = (formula: string, fields: Record<string, unknown>): unknown => {
  const tokens =
    formula.match(/\{[^}]*\}|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?|[A-Za-z_]+|!=|<=|>=|[()=,<>]/g) ?? [];

  if (tokens.join("").length !== formula.replace(/\s+/g, "").length) {
    throw new FormulaError(`The formula could not be read: ${formula}`);
  }

  let position = 0;
  const next = () => tokens[position++];
  const peek = () => tokens[position];

  const toTime = (value: unknown) => {
    const time = value instanceof Date ? value.getTime() : Date.parse(String(value ?? ""));
    return Number.isNaN(time) ? null : time;
  };

  const primary = (): unknown => {
    const token = next();
    if (token === undefined) throw new FormulaError("The formula ends too early");

    if (token.startsWith("{")) return fields[token.slice(1, -1)] ?? null;
    if (token.startsWith("'") || token.startsWith('"')) return token.slice(1, -1);
    if (/^-?\d/.test(token)) return Number(token);

    if (!/^[A-Za-z_]+$/.test(token) || next() !== "(") {
      throw new FormulaError(`Unexpected "${token}" in the formula`);
    }

    const args: unknown[] = [];
    while (peek() !== ")") {
      args.push(expression());
      if (peek() === ",") next();
      else if (peek() !== ")") throw new FormulaError(`Missing ")" after ${token}(`);
    }
    next();

    switch (token.toUpperCase()) {
      case "AND":
        return args.every(Boolean);
      case "OR":
        return args.some(Boolean);
      case "NOT":
        return !args[0];
      case "NOW":
        return new Date();
      case "DATEADD": {
        const start = toTime(args[0]);
        const unit = String(args[2]).toLowerCase();
        const size = unit.startsWith("day") ? 86_400_000 : unit.startsWith("hour") ? 3_600_000 : null;

        if (start === null || size === null) throw new FormulaError("DATEADD needs a date and days or hours");
        return new Date(start + Number(args[1]) * size);
      }
      case "IS_BEFORE": {
        const [a, b] = [toTime(args[0]), toTime(args[1])];
        return a !== null && b !== null && a < b;
      }
      default:
        throw new FormulaError(`Unknown function ${token}`);
    }
  };

  const expression = (): unknown => {
    const left = primary();
    const operator = peek();

    if (!operator || !["=", "!=", "<", ">", "<=", ">="].includes(operator)) return left;
    next();
    const right = primary();

    const numeric = typeof left === "number" || typeof right === "number";
    const a = numeric ? Number(left ?? 0) : String(left ?? "");
    const b = numeric ? Number(right ?? 0) : String(right ?? "");

    switch (operator) {
      case "=":
        return a === b;
      case "!=":
        return a !== b;
      case "<":
        return a < b;
      case ">":
        return a > b;
      case "<=":
        return a <= b;
      default:
        return a >= b;
    }
  };

  const result = expression();
  if (position < tokens.length) throw new FormulaError(`Unexpected "${peek()}" in the formula`);

  return result;
};

// ------------------------------------------------------------------ Gmail
const decodeRawEmail = (raw: string) => {
  const text = Buffer.from(raw, "base64url").toString("utf8");
  const split = text.indexOf("\r\n\r\n");
  const headers: Record<string, string> = {};

  for (const line of text.slice(0, split).split("\r\n")) {
    const separator = line.indexOf(":");
    if (separator > 0) headers[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }

  return {
    headers,
    body: Buffer.from(text.slice(split + 4).replace(/\s+/g, ""), "base64").toString("utf8"),
  };
};

const gmailMessage = (message: MockMessage) => ({
  id: message.id,
  threadId: message.threadId,
  labelIds: message.labelIds,
  snippet: message.text.slice(0, 100),
  internalDate: String(message.internalDate),
  payload: {
    mimeType: "text/plain",
    headers: Object.entries(message.headers).map(([name, value]) => ({ name, value })),
    body: { data: Buffer.from(message.text, "utf8").toString("base64url") },
  },
});

// A prospect answers one of our emails: the message lands in the inbox, in
// the thread of the email it answers
const receiveReply = (reply: { threadId: string; from: string; subject: string; text: string; at: number }) => {
  const id = `msg-in-${++mock.counter}`;

  mock.messages.set(id, {
    id,
    threadId: reply.threadId,
    labelIds: ["INBOX", "UNREAD"],
    internalDate: reply.at,
    headers: {
      From: reply.from,
      To: MAILBOX,
      Subject: reply.subject,
      "Message-ID": `<${id}@prospect.test>`,
      Date: new Date(reply.at).toUTCString(),
    },
    text: reply.text,
  });

  return id;
};

// --------------------------------------------------------------- AI model
// Fixed answers, picked by what the node asked for
const DRAFT_BODY = [
  "Hi there,",
  "",
  'I enjoyed your page and noticed you list resources for small gardens. We wrote a guide called "Raised Beds for Beginners" that your readers may find useful.',
  "",
  "If this is not for you, reply \"no thanks\" and I will not write again.",
  "",
  "Sam, Our Garden Shop",
].join("\n");

const answerModel = (system: string, prompt: string): string => {
  if (system.includes("Extract these attributes")) {
    const relevant = /garden|vegetable|compost/i.test(prompt);

    return JSON.stringify({
      relevant,
      score: relevant ? 9 : 1,
      reason: relevant ? "A gardening resource page." : "Not about gardening.",
    });
  }

  if (system.includes("Categories:")) {
    const category = /unsubscribe|remove me|stop emailing/i.test(prompt)
      ? "unsubscribe"
      : /not interested|no thanks/i.test(prompt)
        ? "declined"
        : "interested";

    return JSON.stringify({ category });
  }

  return DRAFT_BODY;
};

// ---------------------------------------------------------------- server
const readBody = (request: http.IncomingMessage) =>
  new Promise<string>((resolve) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });

const handleMockRequest = async (request: http.IncomingMessage, response: http.ServerResponse) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
  const method = request.method ?? "GET";
  const bodyText = await readBody(request);
  const json = () => (bodyText ? JSON.parse(bodyText) : {});

  const send = (status: number, body: unknown, type = "application/json") => {
    response.writeHead(status, { "content-type": type });
    response.end(typeof body === "string" ? body : JSON.stringify(body));
  };

  const bearer = String(request.headers.authorization ?? "").replace(/^Bearer\s+/i, "");

  // ---- A prospect's website
  const site = ALL_SITES.find((entry) => entry.host === url.hostname);
  if (site) {
    mock.pageFetches.push(site.host);
    return url.pathname === site.path
      ? send(200, pageHtml(site), "text/html; charset=utf-8")
      : send(404, "Not found", "text/plain");
  }

  const [, service, ...rest] = url.pathname.split("/");
  const route = `/${rest.join("/")}`;

  switch (service) {
    // ---- Tavily: POST /search
    case "tavily": {
      if (bearer !== KEYS.tavily) return send(401, { detail: { error: "Unauthorized: missing or invalid API key." } });
      const { query, max_results: maxResults } = json();

      return send(200, {
        query,
        results: [NEW_SITES[0], EXISTING_SITE, NEW_SITES[1], NEW_SITES[2], SUPPRESSED_SITE, NEW_SITES[3], NEW_SITES[4]]
          .slice(0, Number(maxResults) || 5)
          .map((entry, index) => ({
            title: entry.title,
            url: siteUrl(entry),
            content: paragraphs(entry)[0],
            score: 0.9 - index * 0.05,
          })),
      });
    }

    // ---- Airtable: /v0/<base>/<table>[/<record>]
    case "airtable": {
      if (bearer !== KEYS.airtable) {
        return send(401, { error: { type: "AUTHENTICATION_REQUIRED", message: "Authentication required" } });
      }

      const [, version, base, tableName, recordId] = route.split("/").map(decodeURIComponent);
      if (version !== "v0" || base !== BASE_ID || !tableName) break;

      const records = table(tableName);

      if (method === "GET" && !recordId) {
        const formula = url.searchParams.get("filterByFormula");
        // Like Airtable: at most 100 records per answer, and an offset to
        // ask for the next ones with while there are more
        const max = Number(url.searchParams.get("maxRecords")) || Infinity;
        const pageSize = Math.min(Number(url.searchParams.get("pageSize")) || 100, 100);
        const start = Number((url.searchParams.get("offset") ?? "").replace("itr", "")) || 0;

        try {
          const matching = records
            .filter((record) => !formula || Boolean(evaluateFormula(formula, record.fields)))
            .slice(0, max);
          const end = start + pageSize;

          mock.airtablePages.push(`${tableName}@${start}`);

          return send(200, {
            records: matching.slice(start, end),
            ...(end < matching.length ? { offset: `itr${end}` } : {}),
          });
        } catch (error) {
          if (!(error instanceof FormulaError)) throw error;
          return send(422, { error: { type: "INVALID_FILTER_BY_FORMULA", message: error.message } });
        }
      }

      if (method === "POST" && !recordId) return send(200, addRecord(tableName, json().fields ?? {}));

      const record = records.find((entry) => entry.id === recordId);
      if (!record) return send(404, { error: { type: "MODEL_ID_NOT_FOUND", message: `Record ${recordId} not found` } });

      if (method === "PATCH") {
        Object.assign(record.fields, json().fields ?? {});
        return send(200, record);
      }

      break;
    }

    // ---- Google: the token of the OAuth client, then Gmail
    case "google-oauth":
      if (route === "/token" && method === "POST") {
        return send(200, { access_token: KEYS.googleAccess, expires_in: 3600, token_type: "Bearer" });
      }
      break;

    case "gmail-api": {
      if (bearer !== KEYS.googleAccess) return send(401, { error: { code: 401, message: "Invalid Credentials" } });

      const messagePath = route.replace(/^\/gmail\/v1\/users\/me\/messages/, "");
      if (messagePath === route) break;

      if (method === "POST" && messagePath === "/send") {
        const { raw, threadId } = json();
        const { headers, body } = decodeRawEmail(raw);
        const id = `msg-${++mock.counter}`;

        const message: MockMessage = {
          id,
          threadId: threadId || `thread-${mock.counter}`,
          labelIds: ["SENT"],
          internalDate: Date.now(),
          // Gmail fills in the sender and the id
          headers: { ...headers, From: MAILBOX, "Message-ID": `<${id}@mail.gmail.test>` },
          text: body,
        };

        mock.messages.set(id, message);
        mock.timeline.push({
          kind: "email",
          to: headers.To ?? "",
          threadId: message.threadId,
          messageId: id,
          subject: headers.Subject ?? "",
        });

        return send(200, { id, threadId: message.threadId, labelIds: message.labelIds });
      }

      // The inbox, newest first and in pages, like Gmail lists it
      if (method === "GET" && messagePath === "") {
        const inbox = [...mock.messages.values()]
          .filter((message) => message.labelIds.includes("INBOX"))
          .sort((a, b) => b.internalDate - a.internalDate);
        const start = Number(url.searchParams.get("pageToken")) || 0;
        const end = start + (Number(url.searchParams.get("maxResults")) || 100);

        return send(200, {
          messages: inbox.slice(start, end).map(({ id, threadId }) => ({ id, threadId })),
          ...(end < inbox.length ? { nextPageToken: String(end) } : {}),
        });
      }

      const message = mock.messages.get(decodeURIComponent(messagePath.slice(1)));
      if (method === "GET" && message) return send(200, gmailMessage(message));
      if (method === "GET") return send(404, { error: { code: 404, message: "Requested entity was not found." } });

      break;
    }

    // ---- Hunter: GET /v2/email-finder?domain=
    case "hunter": {
      if (request.headers["x-api-key"] !== KEYS.hunter) return send(401, { errors: [{ details: "No user found for the API key supplied" }] });
      const domain = url.searchParams.get("domain") ?? "";

      return send(200, { data: { email: `editor@${domain}`, score: 92, domain } });
    }

    // ---- ZeroBounce: GET /v2/validate?api_key=&email=
    case "zerobounce":
      if (url.searchParams.get("api_key") !== KEYS.zeroBounce) return send(200, { error: "Invalid API key" });

      // An API that repeats the address it was called with, key and all:
      // what is stored about the run must not hold it
      return send(200, {
        address: url.searchParams.get("email"),
        status: "valid",
        sub_status: "",
        requested: `${url.pathname}${url.search}`,
      });

    // ---- The AI model: POST /v1/chat/completions
    case "ai": {
      if (bearer !== KEYS.model) return send(401, { error: { message: "Incorrect API key provided" } });
      if (route !== "/v1/chat/completions" || method !== "POST") break;

      const { model, messages } = json() as { model: string; messages: { role: string; content: unknown }[] };
      const textOf = (role: string) =>
        messages
          .filter((message) => message.role === role || (role === "system" && message.role === "developer"))
          .map((message) =>
            typeof message.content === "string"
              ? message.content
              : (message.content as { text?: string }[]).map((part) => part.text ?? "").join("")
          )
          .join("\n");

      return send(200, {
        id: `chatcmpl-${++mock.counter}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: answerModel(textOf("system"), textOf("user")) },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      });
    }
  }

  mock.unexpected.push(`${method} ${url.host}${url.pathname}`);
  send(404, { error: { message: `The mock server has no answer for ${method} ${url.pathname}` } });
};

// =========================================================================
// 3. THE CHECKS
// =========================================================================
type Result = { id: string; name: string; passed: boolean; reason: string };

const results: Result[] = [];

const check = async (id: string, name: string, fn: () => unknown) => {
  try {
    await fn();
    results.push({ id, name, passed: true, reason: "" });
  } catch (error) {
    results.push({
      id,
      name,
      passed: false,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
};

const expect = (condition: unknown, reason: string) => {
  if (!condition) throw new Error(reason);
};

const printResults = () => {
  const width = Math.max(...results.map((result) => result.id.length + result.name.length)) + 2;

  console.log(`\n${"CHECK".padEnd(width + 2)}RESULT`);
  console.log("-".repeat(width + 8));

  for (const result of results) {
    console.log(`${`${result.id}  ${result.name}`.padEnd(width + 2)}${result.passed ? "PASS" : "FAIL"}`);
    if (!result.passed) console.log(`      reason: ${result.reason}`);
  }

  const failed = results.filter((result) => !result.passed).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
};

// =========================================================================
// 4. THE RUN
// =========================================================================
const main = async () => {
  const problem = getDatabaseProblem();
  if (problem) {
    console.error(`Refusing to run: ${problem}`);
    process.exitCode = 2;
    return;
  }

  // Set before the app is loaded, so that nothing is taken from .env: the
  // Prisma client fills in whatever is missing from it
  Object.assign(process.env, {
    ENCRYPTION_KEY: "backlink-test-encryption-key",
    BETTER_AUTH_SECRET: "backlink-test-auth-secret",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    GOOGLE_CLIENT_ID: "backlink-test-client",
    GOOGLE_CLIENT_SECRET: "backlink-test-client-secret",
    INNGEST_DEV: "1",
    INNGEST_EVENT_KEY: "backlink-test",
    INNGEST_SIGNING_KEY: "backlink-test",
    OPENAI_API_KEY: "backlink-test",
    ANTHROPIC_API_KEY: "backlink-test",
    GOOGLE_GENERATIVE_AI_API_KEY: "backlink-test",
    POLAR_ACCESS_TOKEN: "backlink-test",
    ALLOW_PRIVATE_NETWORK_REQUESTS: "false",
  });

  // ------------------------------------------------------------ mock server
  const server = http.createServer((request, response) => {
    handleMockRequest(request, response).catch((error) => {
      mock.unexpected.push(`${request.method} ${request.url}: ${error instanceof Error ? error.message : error}`);
      response.writeHead(500).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  mock.port = (server.address() as AddressInfo).port;
  const mockUrl = `http://127.0.0.1:${mock.port}`;

  // The only private address workflows may reach, and only in this process
  process.env.PRIVATE_NETWORK_ALLOWLIST = `127.0.0.1:${mock.port}`;

  // The prospects' host names exist nowhere: they resolve to the mock server
  const realLookup = dns.lookup;
  (dns as { lookup: unknown }).lookup = (hostname: string, options: unknown, callback: unknown) => {
    const done = (typeof options === "function" ? options : callback) as (
      error: null,
      address: unknown,
      family?: number
    ) => void;
    const all = typeof options === "object" && options !== null && (options as { all?: boolean }).all;

    if (!ALL_SITES.some((site) => site.host === hostname)) {
      return (realLookup as (...args: unknown[]) => void)(hostname, options, callback);
    }

    return all ? done(null, [{ address: "127.0.0.1", family: 4 }]) : done(null, "127.0.0.1", 4);
  };

  // Nodes with a fixed address: their requests go to the mock server.
  // Anything else that tries to leave this machine is refused.
  const blocked: string[] = [];
  const redirect = (origin: string, prefix: string) =>
    intercept.all(`${origin}/*`, async ({ request }) => {
      const url = new URL(request.url);
      const hasBody = !["GET", "HEAD"].includes(request.method);

      return fetch(
        bypass(`${mockUrl}/${prefix}${url.pathname}${url.search}`, {
          method: request.method,
          headers: request.headers,
          body: hasBody ? await request.arrayBuffer() : undefined,
        })
      );
    });

  const network = setupServer(
    redirect("https://api.tavily.com", "tavily"),
    redirect("https://api.airtable.com", "airtable"),
    redirect("https://oauth2.googleapis.com", "google-oauth"),
    redirect("https://gmail.googleapis.com", "gmail-api")
  );
  network.listen({
    onUnhandledRequest: (request, print) => {
      if (new URL(request.url).hostname === "127.0.0.1") return;

      blocked.push(`${request.method} ${request.url}`);
      print.error();
    },
  });

  // ------------------------------------------------------------- the app
  const { ExecutionStatus, NodeType, PrismaClient } = await import("@prisma/client");
  const { encrypt } = await import("../src/lib/encryption");
  const { inngest } = await import("../src/inngest/client");
  const { executeWorkflow } = await import("../src/inngest/functions");
  const { gmailTriggerPoll } = await import("../src/inngest/gmail-trigger");

  const prisma = new PrismaClient();
  const run = Math.random().toString(36).slice(2, 10);

  // Events the app sends to Inngest (a trigger starting a run) are kept
  // here and run below, instead of going to an Inngest server
  const sentEvents: { name: string; data: Record<string, unknown> }[] = [];
  (inngest as unknown as { send: unknown }).send = async (payload: unknown) => {
    sentEvents.push(...((Array.isArray(payload) ? payload : [payload]) as typeof sentEvents));
    return { ids: [] };
  };

  // Inngest's step tools, run in this process. A step's result is stored as
  // JSON by Inngest, so it is passed through JSON here too. A sleep is
  // written down instead of waited for.
  const step = {
    run: async (_id: string, fn: () => unknown) => {
      const value = await fn();
      return value === undefined ? null : JSON.parse(JSON.stringify(value));
    },
    sleep: async (_id: string, duration: string | number) => {
      mock.timeline.push({ kind: "sleep", duration: String(duration) });
    },
    sleepUntil: async (_id: string, time: unknown) => {
      mock.timeline.push({ kind: "sleep", duration: `until ${String(time)}` });
    },
    waitForEvent: async () => null,
    sendEvent: async () => ({ ids: [] }),
    invoke: async () => {
      throw new Error("step.invoke is not available in this test");
    },
  };

  const handlerOf = (fn: unknown) =>
    (fn as { fn: (context: unknown) => Promise<Record<string, unknown>> }).fn;

  type RunOutcome = { ok: boolean; error: string; executionId: string };

  // Runs one execution with the engine's own function, the one Inngest calls
  const execute = async (data: Record<string, unknown>): Promise<RunOutcome> => {
    const executionId = String(data.executionId);

    try {
      await handlerOf(executeWorkflow)({
        event: { id: `evt-${executionId}`, name: "workflows/execute.workflow", ts: Date.now(), data },
        step,
      });

      return { ok: true, error: "", executionId };
    } catch (error) {
      const failedNode = await prisma.executionNode.findFirst({
        where: { executionId, status: ExecutionStatus.FAILED },
        orderBy: { startedAt: "desc" },
      });

      return {
        ok: false,
        executionId,
        error: failedNode
          ? `node "${failedNode.nodeName}" failed: ${failedNode.error}`
          : error instanceof Error
            ? error.message
            : String(error),
      };
    }
  };

  const runWorkflow = async (workflowId: string, trigger: string) => {
    const execution = await prisma.execution.create({
      data: { workflowId, status: ExecutionStatus.RUNNING },
    });

    return execute({ workflowId, executionId: execution.id, trigger, InitialData: {} });
  };

  const user = await prisma.user.create({
    data: {
      id: `backlink-test-${run}`,
      name: "Backlink agent test",
      email: `agent-${run}@backlink-test.invalid`,
      emailVerified: true,
      // The free trial unlocks every node the workflows use
      trialEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  try {
    // -------------------------------------------------------- credentials
    const credential = async (name: string, type: string, value: string) =>
      (
        await prisma.credential.create({
          data: { name, type: type as never, value: encrypt(value), userId: user.id },
        })
      ).id;

    const tavilyKey = await credential("Tavily", "TAVILY", KEYS.tavily);
    const airtableKey = await credential("Airtable", "AIRTABLE", KEYS.airtable);
    const modelKey = await credential("Model", "OPENAI_COMPATIBLE", KEYS.model);
    const hunterKey = await credential("Hunter", "HTTP_HEADER_AUTH", `X-API-KEY: ${KEYS.hunter}`);
    // ZeroBounce only takes its key in the address
    const zeroBounceKey = await credential("ZeroBounce", "HTTP_QUERY_AUTH", `api_key: ${KEYS.zeroBounce}`);
    const googleAccount = await credential(
      "Outreach mailbox",
      "GOOGLE_OAUTH2",
      JSON.stringify({ refreshToken: "test-refresh-token", email: MAILBOX })
    );

    // ---------------------------------------------------------- workflows
    type NodeSpec = { key: string; name: string; type: string; data?: Record<string, unknown> };
    // [from, to, fromOutput, toInput]
    type EdgeSpec = [string, string, string?, string?];

    const createWorkflow = async (name: string, nodes: NodeSpec[], edges: EdgeSpec[], active = false) => {
      const workflow = await prisma.workflow.create({ data: { name, userId: user.id, active } });
      const nodeId = (key: string) => `${workflow.id}-${key}`;

      await prisma.node.createMany({
        data: nodes.map((node, index) => ({
          id: nodeId(node.key),
          workflowId: workflow.id,
          name: node.name,
          type: node.type as never,
          position: { x: index * 220, y: 0 },
          data: (node.data ?? {}) as never,
        })),
      });

      await prisma.connection.createMany({
        data: edges.map(([from, to, fromOutput, toInput]) => ({
          workflowId: workflow.id,
          fromNodeId: nodeId(from),
          toNodeId: nodeId(to),
          fromOutput: fromOutput ?? "main",
          toInput: toInput ?? "main",
        })),
      });

      return workflow.id;
    };

    const airtable = (operation: string, tableName: string, extra: Record<string, unknown>) => ({
      credentialId: airtableKey,
      operation,
      baseId: BASE_ID,
      table: tableName,
      ...extra,
    });

    const onlyIf = (inputKey: string, operator: string, value?: string) => ({
      conditions: [{ inputKey, operator, value }],
      combinator: "and",
    });

    // A Chat Model node pointed at the mock model. Without a prompt it is
    // the model of the node it is plugged into.
    const model = (extra: Record<string, unknown> = {}) => ({
      credentialId: modelKey,
      provider: "custom",
      baseUrl: `${mockUrl}/ai/v1`,
      model: "mock-model",
      ...extra,
    });

    const gmail = (operation: string, extra: Record<string, unknown>) => ({
      credentialId: googleAccount,
      operation,
      emailType: "text",
      ...extra,
    });

    // 1. PROSPECTING: search, then for every result: skip known and
    //    suppressed domains, read the page, score it, find and verify an
    //    email, draft the first email, save the prospect as "pending"
    const prospecting = await createWorkflow(
      "Backlinks 1: Prospecting",
      [
        { key: "start", name: "Manual Trigger", type: "MANUAL_TRIGGER" },
        {
          key: "search",
          name: "Web Search",
          type: "WEB_SEARCH",
          data: { variableName: "search", credentialId: tavilyKey, operation: "tavily", query: "gardening blogs resources page", maxResults: "10" },
        },
        { key: "split", name: "Split Out results", type: "SPLIT_OUT", data: { variableName: "results", inputPath: "search", field: "results" } },
        {
          key: "prospect",
          name: "Prospect fields",
          type: "EDIT_FIELDS",
          data: {
            variableName: "prospect",
            include: "none",
            assignments: [
              "url = {{ $json.url }}",
              "title = {{ $json.title }}",
              "domain = {{ $json.url.split('/')[2].split(':')[0].replace('www.', '') }}",
            ].join("\n"),
          },
        },
        {
          key: "existing",
          name: "Already in the table?",
          type: "AIRTABLE",
          data: airtable("list_records", "Prospects", { variableName: "existing", filterByFormula: "{domain}='{{prospect.domain}}'", maxRecords: "1" }),
        },
        { key: "isNew", name: "IF new domain", type: "IF", data: onlyIf("existing.count", "equals", "0") },
        {
          key: "suppressed",
          name: "On the suppression list?",
          type: "AIRTABLE",
          data: airtable("list_records", "Suppression", { variableName: "suppressed", filterByFormula: "{domain}='{{prospect.domain}}'", maxRecords: "1" }),
        },
        { key: "isAllowed", name: "IF not suppressed", type: "IF", data: onlyIf("suppressed.count", "equals", "0") },
        { key: "page", name: "Read Web Page", type: "READ_WEB_PAGE", data: { variableName: "page", operation: "builtin", url: "{{prospect.url}}", format: "text", maxCharacters: "4000" } },
        { key: "scoreModel", name: "Scoring model", type: "CHAT_MODEL", data: model() },
        {
          key: "score",
          name: "Score the page",
          type: "INFORMATION_EXTRACTOR",
          data: {
            variableName: "score",
            inputText: "Site: {{prospect.title}}\n\n{{page.content}}",
            attributes: [
              "relevant (boolean): true when the page is about gardening and could link to a gardening guide",
              "score (number): 1 to 10",
              "reason: one sentence",
            ].join("\n"),
            systemPrompt: "You judge whether a web page is a good link prospect for a gardening shop.",
          },
        },
        { key: "isRelevant", name: "IF relevant", type: "IF", data: onlyIf("score.output.relevant", "equals", "true") },
        {
          key: "hunter",
          name: "Find email (Hunter)",
          type: "HTTP_REQUEST",
          data: {
            variableName: "hunter",
            method: "GET",
            endpoint: `${mockUrl}/hunter/v2/email-finder`,
            queryParams: "domain: {{prospect.domain}}",
            authentication: "header",
            credentialId: hunterKey,
          },
        },
        { key: "hasEmail", name: "IF email found", type: "IF", data: onlyIf("hunter.httpResponse.data.data.email", "exists") },
        {
          key: "verify",
          name: "Verify email (ZeroBounce)",
          type: "HTTP_REQUEST",
          data: {
            variableName: "verify",
            method: "GET",
            endpoint: `${mockUrl}/zerobounce/v2/validate`,
            queryParams: "email: {{hunter.httpResponse.data.data.email}}",
            authentication: "query",
            credentialId: zeroBounceKey,
          },
        },
        { key: "isValid", name: "IF email valid", type: "IF", data: onlyIf("verify.httpResponse.data.status", "equals", "valid") },
        {
          key: "draft",
          name: "Draft the email",
          type: "CHAT_MODEL",
          data: model({
            variableName: "draft",
            systemPrompt: "You write short, honest outreach emails with an opt-out line.",
            userPrompt: "Write the first email to the editor of {{prospect.title}} ({{prospect.url}}).",
          }),
        },
        {
          key: "save",
          name: "Save the prospect",
          type: "AIRTABLE",
          data: airtable("create_record", "Prospects", {
            variableName: "saved",
            fieldsJson:
              '{"domain":{{json prospect.domain}},"url":{{json prospect.url}},"title":{{json prospect.title}},' +
              '"email":{{json hunter.httpResponse.data.data.email}},"score":{{json score.output.score}},' +
              '"subject":"A resource for {{prospect.title}}","body":{{json draft.text}},"followups":0,"status":"pending"}',
          }),
        },
      ],
      [
        ["start", "search"],
        ["search", "split"],
        ["split", "prospect"],
        ["prospect", "existing"],
        ["existing", "isNew"],
        ["isNew", "suppressed", "true"],
        ["suppressed", "isAllowed"],
        ["isAllowed", "page", "true"],
        ["page", "score"],
        ["scoreModel", "score", "main", "sub-model"],
        ["score", "isRelevant"],
        ["isRelevant", "hunter", "true"],
        ["hunter", "hasEmail"],
        ["hasEmail", "verify", "true"],
        ["verify", "isValid"],
        ["isValid", "draft", "true"],
        ["draft", "save"],
      ]
    );

    // 2. SENDING: every approved row gets its email, the row is updated,
    //    then a pause before the next one. `list` is how the rows reach the
    //    emails: a Loop node, or a Split Out node (per-item execution).
    const sendingNodes = (tableName: string, list: "loop" | "split"): NodeSpec[] => {
      const row = list === "loop" ? "loop.item" : "item";

      return [
        { key: "start", name: "Manual Trigger", type: "MANUAL_TRIGGER" },
        {
          key: "approved",
          name: "Approved rows",
          type: "AIRTABLE",
          data: airtable("list_records", tableName, { variableName: "approved", filterByFormula: "{status}='approved'" }),
        },
        list === "loop"
          ? { key: "each", name: "Loop over rows", type: "LOOP", data: { variableName: "loop", itemsPath: "approved.records" } }
          : { key: "each", name: "Split Out rows", type: "SPLIT_OUT", data: { variableName: "rows", inputPath: "approved", field: "records" } },
        {
          key: "send",
          name: "Send email",
          type: "GMAIL",
          data: gmail("send_email", {
            variableName: "send",
            to: `{{${row}.fields.email}}`,
            subject: `{{${row}.fields.subject}}`,
            message: `{{${row}.fields.body}}`,
          }),
        },
        {
          key: "mark",
          name: "Mark as sent",
          type: "AIRTABLE",
          data: airtable("update_record", tableName, {
            variableName: "marked",
            // The row's id is read before the send replaced {{item}}
            recordId: list === "loop" ? "{{loop.item.id}}" : "{{rows.id}}",
            fieldsJson:
              '{"message_id":{{json send.id}},"thread_id":{{json send.threadId}},"sent_at":"{{ $now.toISO() }}","status":"sent"}',
          }),
        },
        { key: "wait", name: "Delay 30 seconds", type: "DELAY", data: { delayAmount: 30, delayUnit: "seconds" } },
      ];
    };

    const sending = await createWorkflow("Backlinks 2: Sending", sendingNodes("Prospects", "loop"), [
      ["start", "approved"],
      ["approved", "each"],
      ["each", "send", "loop"],
      ["send", "mark"],
      ["mark", "wait"],
    ]);

    const sendingPerItem = await createWorkflow(
      "Backlinks 2b: Sending without a Loop",
      sendingNodes("SplitOutVariant", "split").filter((node) => node.key !== "mark"),
      [
        ["start", "approved"],
        ["approved", "each"],
        ["each", "send"],
        ["send", "wait"],
      ]
    );

    // 3. REPLIES AND FOLLOW-UPS: a new email in the mailbox updates the row
    //    of its thread; once a day, rows sent 5 or more days ago that got no
    //    reply get one follow-up in the same thread
    const replies = await createWorkflow(
      "Backlinks 3: Replies and follow-ups",
      [
        { key: "mail", name: "Gmail Trigger", type: "GMAIL_TRIGGER", data: { credentialId: googleAccount, query: "in:inbox", pollMinutes: "1" } },
        {
          key: "match",
          name: "Row of this thread",
          type: "AIRTABLE",
          data: airtable("list_records", "Prospects", { variableName: "match", filterByFormula: "{thread_id}='{{gmail.threadId}}'", maxRecords: "1" }),
        },
        { key: "isOurs", name: "IF a row matched", type: "IF", data: onlyIf("match.count", "greater_than", "0") },
        { key: "replyModel", name: "Reply model", type: "CHAT_MODEL", data: model() },
        {
          key: "classify",
          name: "Classify the reply",
          type: "TEXT_CLASSIFIER",
          data: {
            variableName: "classification",
            inputText: "{{gmail.text}}",
            categories: [
              "interested: wants the link, asks a question or agrees",
              "declined: says no",
              "unsubscribe: asks not to be contacted again",
            ].join("\n"),
          },
        },
        {
          key: "replied",
          name: "Mark as replied",
          type: "AIRTABLE",
          data: airtable("update_record", "Prospects", {
            variableName: "updated",
            recordId: "{{match.records.[0].id}}",
            fieldsJson: '{"reply_category":{{json classification.category}},"replied_at":"{{ $now.toISO() }}","status":"replied"}',
          }),
        },

        { key: "daily", name: "Schedule Trigger", type: "SCHEDULE_TRIGGER", data: { variableName: "scheduleTrigger", cronExpression: "0 9 * * *" } },
        {
          key: "due",
          name: "Rows due a follow-up",
          type: "AIRTABLE",
          data: airtable("list_records", "Prospects", {
            variableName: "due",
            filterByFormula: "AND({status}='sent',{followups}=0,IS_BEFORE({sent_at},DATEADD(NOW(),-5,'days')))",
          }),
        },
        { key: "each", name: "Loop over rows", type: "LOOP", data: { variableName: "loop", itemsPath: "due.records" } },
        {
          key: "followUp",
          name: "Follow up in the thread",
          type: "GMAIL",
          data: gmail("reply", {
            variableName: "followUp",
            messageId: "{{loop.item.fields.message_id}}",
            message: "Hi, just checking that my note about our raised beds guide reached you. Reply \"no thanks\" and I will not write again.",
          }),
        },
        {
          key: "counted",
          name: "Count the follow-up",
          type: "AIRTABLE",
          data: airtable("update_record", "Prospects", {
            variableName: "counted",
            recordId: "{{loop.item.id}}",
            fieldsJson: '{"last_followup_at":"{{ $now.toISO() }}","followups":1}',
          }),
        },
      ],
      [
        ["mail", "match"],
        ["match", "isOurs"],
        ["isOurs", "classify", "true"],
        ["replyModel", "classify", "main", "sub-model"],
        ["classify", "replied", "category-interested"],
        ["classify", "replied", "category-declined"],
        ["classify", "replied", "category-unsubscribe"],
        ["classify", "replied", "other"],
        ["daily", "due"],
        ["due", "each"],
        ["each", "followUp", "loop"],
        ["followUp", "counted"],
      ],
      // The Gmail Trigger only polls active workflows
      true
    );

    // 4. LINK CHECKER: download each contacted prospect's page as raw HTML
    //    (Read Web Page would drop the footer) and look for our domain
    const linkChecker = await createWorkflow(
      "Backlinks 4: Link checker",
      [
        { key: "start", name: "Schedule Trigger", type: "SCHEDULE_TRIGGER", data: { variableName: "scheduleTrigger", cronExpression: "0 8 * * 1" } },
        {
          key: "rows",
          name: "Contacted rows",
          type: "AIRTABLE",
          data: airtable("list_records", "Prospects", { variableName: "rows", filterByFormula: "OR({status}='sent',{status}='replied')" }),
        },
        { key: "each", name: "Loop over rows", type: "LOOP", data: { variableName: "loop", itemsPath: "rows.records" } },
        {
          key: "fetch",
          name: "Download the page",
          type: "HTTP_REQUEST",
          data: { variableName: "fetched", method: "GET", endpoint: "{{loop.item.fields.url}}", neverError: true },
        },
        { key: "hasLink", name: "IF the page has our link", type: "IF", data: onlyIf("fetched.httpResponse.data", "contains", OUR_DOMAIN) },
        {
          key: "linked",
          name: "Mark as linked",
          type: "AIRTABLE",
          data: airtable("update_record", "Prospects", {
            variableName: "linked",
            recordId: "{{loop.item.id}}",
            fieldsJson: '{"linked_at":"{{ $now.toISO() }}","status":"linked"}',
          }),
        },
      ],
      [
        ["start", "rows"],
        ["rows", "each"],
        ["each", "fetch", "loop"],
        ["fetch", "hasLink"],
        ["hasLink", "linked", "true"],
      ]
    );

    // ------------------------------------------------- what is there before
    const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

    mock.messages.set("msg-seed", {
      id: "msg-seed",
      threadId: "thread-seed",
      labelIds: ["SENT"],
      internalDate: Date.now() - 86_400_000,
      headers: { From: MAILBOX, To: `editor@${EXISTING_SITE.host}`, Subject: "A resource for you", "Message-ID": "<msg-seed@mail.gmail.test>" },
      text: "Hello",
    });

    // Contacted yesterday: a known domain, not yet due a follow-up, and its
    // page never links to us
    const seeded = addRecord("Prospects", {
      domain: EXISTING_SITE.host,
      url: siteUrl(EXISTING_SITE),
      title: EXISTING_SITE.title,
      email: `editor@${EXISTING_SITE.host}`,
      status: "sent",
      followups: 0,
      message_id: "msg-seed",
      thread_id: "thread-seed",
      sent_at: daysAgo(1),
    });
    addRecord("Suppression", { domain: SUPPRESSED_SITE.host, reason: "asked not to be contacted" });

    const prospects = () => table("Prospects");
    const rowOf = (host: string) => prospects().find((record) => record.fields.domain === host);
    const emails = () => mock.timeline.filter((entry) => entry.kind === "email") as Extract<TimelineEntry, { kind: "email" }>[];
    const describe = (entries: TimelineEntry[]) =>
      entries.map((entry) => (entry.kind === "email" ? `email to ${entry.to}` : `pause ${entry.duration}`)).join(", ") || "nothing";

    const relevantHosts = NEW_SITES.filter((site) => site.relevant).map((site) => site.host);
    const [hostA, hostB, hostC] = relevantHosts;

    // =================================================== a. PROSPECTING
    console.log("Running: 1. Prospecting");
    const prospectingRun = await runWorkflow(prospecting, NodeType.MANUAL_TRIGGER);
    const created = prospects().filter((record) => record.id !== seeded.id);

    await check("a1", "Prospecting run finishes", () => expect(prospectingRun.ok, prospectingRun.error));
    await check("a2", "Saves exactly the 3 relevant prospects as pending", () => {
      const hosts = created.map((record) => String(record.fields.domain)).sort();

      expect(
        hosts.join() === [...relevantHosts].sort().join(),
        `saved ${hosts.length} new row(s): ${hosts.join(", ") || "none"}; expected ${[...relevantHosts].sort().join(", ")}`
      );

      for (const record of created) {
        expect(record.fields.status === "pending", `${record.fields.domain} has status "${record.fields.status}"`);
        expect(record.fields.email === `editor@${record.fields.domain}`, `${record.fields.domain} has email "${record.fields.email}"`);
        expect(record.fields.body === DRAFT_BODY, `${record.fields.domain}: the drafted email was not stored as written`);
      }
    });
    await check("a3", "Skips the domain already in the table", () => {
      const rows = prospects().filter((record) => record.fields.domain === EXISTING_SITE.host);

      expect(rows.length === 1, `${rows.length} rows for ${EXISTING_SITE.host}`);
      expect(!mock.pageFetches.includes(EXISTING_SITE.host), "its page was read although the domain was known");
    });
    await check("a4", "Skips the suppressed domain", () => {
      expect(!rowOf(SUPPRESSED_SITE.host), `${SUPPRESSED_SITE.host} was saved`);
      expect(!mock.pageFetches.includes(SUPPRESSED_SITE.host), "its page was read although the domain is suppressed");
    });

    // ====================================================== b. SENDING
    // A person approves two of the three prospects in Airtable
    for (const host of [hostA, hostB]) {
      const row = rowOf(host);
      if (row) row.fields.status = "approved";
    }

    console.log("Running: 2. Sending");
    mock.timeline.length = 0;
    const sendingRun = await runWorkflow(sending, NodeType.MANUAL_TRIGGER);
    const sendingTimeline = [...mock.timeline];
    const firstEmails = emails();

    await check("b1", "Sending run finishes", () => expect(sendingRun.ok, sendingRun.error));
    await check("b2", "Sends only the rows marked approved", () => {
      const to = firstEmails.map((email) => email.to).sort();
      const wanted = [`editor@${hostA}`, `editor@${hostB}`].sort();

      expect(to.join() === wanted.join(), `emails went to: ${to.join(", ") || "nobody"}; expected ${wanted.join(", ")}`);
      expect(rowOf(hostC)?.fields.status === "pending", `the row that was not approved now has status "${rowOf(hostC)?.fields.status}"`);
    });
    await check("b3", "Stores messageId, threadId and sent_at on the row", () => {
      for (const host of [hostA, hostB]) {
        const fields = rowOf(host)?.fields ?? {};
        const email = firstEmails.find((entry) => entry.to === `editor@${host}`);

        expect(email, `no email was sent to editor@${host}`);
        expect(fields.status === "sent", `${host}: status is "${fields.status}"`);
        expect(fields.message_id === email!.messageId, `${host}: message_id is "${fields.message_id}", Gmail returned "${email!.messageId}"`);
        expect(fields.thread_id === email!.threadId, `${host}: thread_id is "${fields.thread_id}", Gmail returned "${email!.threadId}"`);
        expect(!Number.isNaN(Date.parse(String(fields.sent_at))), `${host}: sent_at is "${fields.sent_at}"`);
      }
    });
    await check("b4", "Waits between emails (Loop + Delay)", () => {
      const kinds = sendingTimeline.map((entry) => entry.kind);
      const first = kinds.indexOf("email");
      const second = kinds.indexOf("email", first + 1);

      expect(first !== -1 && second !== -1, `order was: ${describe(sendingTimeline)}`);
      expect(
        kinds.slice(first, second).includes("sleep"),
        `no pause between the emails; order was: ${describe(sendingTimeline)}`
      );
      expect(
        sendingTimeline.some((entry) => entry.kind === "sleep" && entry.duration === "30s"),
        `the pause was not 30 seconds; order was: ${describe(sendingTimeline)}`
      );
    });

    addRecord("SplitOutVariant", { email: "one@variant.test", subject: "One", body: "One", status: "approved" });
    addRecord("SplitOutVariant", { email: "two@variant.test", subject: "Two", body: "Two", status: "approved" });

    console.log("Running: 2b. Sending without a Loop");
    mock.timeline.length = 0;
    const perItemRun = await runWorkflow(sendingPerItem, NodeType.MANUAL_TRIGGER);
    const perItemTimeline = [...mock.timeline];

    await check("b5", "Waits between emails without a Loop (Split Out + Delay)", () => {
      expect(perItemRun.ok, perItemRun.error);

      const kinds = perItemTimeline.map((entry) => entry.kind);
      const first = kinds.indexOf("email");
      const second = kinds.indexOf("email", first + 1);

      expect(
        second !== -1 && kinds.slice(first, second).includes("sleep"),
        `no pause between the emails; order was: ${describe(perItemTimeline)}`
      );
    });

    // ====================================== c. REPLIES AND FOLLOW-UPS
    const rowA = rowOf(hostA);
    const rowB = rowOf(hostB);
    const threadA = String(rowA?.fields.thread_id ?? "");
    const threadB = String(rowB?.fields.thread_id ?? "");

    console.log("Running: 3. Replies (Gmail Trigger)");
    const pollStart = Date.now();

    // The first poll of a Gmail Trigger only notes the time
    await handlerOf(gmailTriggerPoll)({ event: { ts: pollStart }, step });

    // Prospect A answers in the thread of our email
    receiveReply({
      threadId: threadA,
      from: `Editor <editor@${hostA}>`,
      subject: `Re: A resource for ${rowA?.fields.title}`,
      text: "Thanks for reaching out. Happy to add your guide, which page should I link to?",
      at: pollStart + 30_000,
    });

    sentEvents.length = 0;
    await handlerOf(gmailTriggerPoll)({ event: { ts: pollStart + 61_000 }, step });

    const replyEvents = sentEvents.filter((event) => event.data.workflowId === replies);
    const replyRuns: RunOutcome[] = [];
    for (const event of replyEvents) replyRuns.push(await execute(event.data));

    await check("c1", "An incoming reply starts the Replies workflow", () => {
      expect(replyEvents.length === 1, `the Gmail Trigger started ${replyEvents.length} run(s) for one new email`);
      expect(replyRuns[0].ok, replyRuns[0].error);
    });
    await check("c2", "The reply updates the right row's status", () => {
      expect(threadA, "row A has no thread_id to match the reply with");
      expect(rowA?.fields.status === "replied", `row ${hostA} has status "${rowA?.fields.status}"`);
      expect(rowA?.fields.reply_category === "interested", `reply_category is "${rowA?.fields.reply_category}"`);
      expect(rowB?.fields.status === "sent", `row ${hostB} was changed to "${rowB?.fields.status}"`);
      expect(seeded.fields.status === "sent", `row ${EXISTING_SITE.host} was changed to "${seeded.fields.status}"`);
    });

    // Six days pass: both emails were sent 6 days ago. A replied, B did not.
    for (const row of [rowA, rowB]) {
      if (row) row.fields.sent_at = daysAgo(6);
    }

    console.log("Running: 3. Follow-ups (Schedule Trigger)");
    mock.timeline.length = 0;
    const followUpRun = await runWorkflow(replies, NodeType.SCHEDULE_TRIGGER);
    const followUps = emails();

    await check("c3", "The row sent 6 days ago with no reply gets exactly one follow-up, in the same thread", () => {
      expect(followUpRun.ok, followUpRun.error);
      expect(threadB, "row B has no thread_id");

      const inThread = followUps.filter((email) => email.threadId === threadB);

      expect(
        followUps.length === 1 && inThread.length === 1,
        `${followUps.length} follow-up(s) sent, ${inThread.length} of them in the thread of ${hostB}`
      );
    });
    await check("c4", "The follow-up is addressed to the prospect", () => {
      const email = followUps.find((entry) => entry.threadId === threadB);

      expect(email, "no follow-up was sent in that thread");
      expect(
        email!.to.includes(`editor@${hostB}`),
        `the follow-up went to "${email!.to}" instead of editor@${hostB}`
      );
    });
    await check("c5", "The row that replied gets no follow-up", () => {
      expect(followUpRun.ok, followUpRun.error);
      expect(
        !followUps.some((email) => email.threadId === threadA),
        `a follow-up was sent in the thread of ${hostA}, which had replied`
      );
      expect(!followUps.some((email) => email.threadId === "thread-seed"), "a follow-up was sent to a row contacted yesterday");
    });

    mock.timeline.length = 0;
    const secondFollowUpRun = await runWorkflow(replies, NodeType.SCHEDULE_TRIGGER);

    await check("c6", "The next day's run sends no second follow-up", () => {
      expect(secondFollowUpRun.ok, secondFollowUpRun.error);
      expect(emails().length === 0, `${emails().length} more follow-up(s) were sent: ${describe(mock.timeline)}`);
    });

    // More replies arrive within one minute than a poll handles: every one
    // of them has to start a run, oldest first, over the next polls
    const BURST = 12;
    const burstIds = Array.from({ length: BURST }, (_, index) =>
      receiveReply({
        threadId: `thread-burst-${index}`,
        from: `Reader ${index} <reader${index}@burst.test>`,
        subject: "Hello",
        text: "A message that belongs to no prospect.",
        at: pollStart + 70_000 + index * 1000,
      })
    );

    console.log("Running: 3. Replies (a burst of emails)");
    sentEvents.length = 0;
    const startedPerPoll: number[] = [];
    for (const minute of [2, 3, 4]) {
      const before = sentEvents.length;
      await handlerOf(gmailTriggerPoll)({ event: { ts: pollStart + minute * 61_000 }, step });
      startedPerPoll.push(sentEvents.length - before);
    }

    await check("c7", `${BURST} emails in one minute all start a run, oldest first`, () => {
      const started = sentEvents.map((event) =>
        String((event.data.InitialData as { gmail?: { id?: string } } | undefined)?.gmail?.id)
      );
      const missing = burstIds.filter((id) => !started.includes(id));

      expect(
        missing.length === 0,
        `${missing.length} of ${BURST} emails never started a run (runs started per poll: ${startedPerPoll.join(", ")})`
      );
      expect(started.length === BURST, `${started.length} runs were started for ${BURST} emails`);
      expect(started.join() === burstIds.join(), `the runs were not started oldest first: ${started.join(", ")}`);
    });

    // ================================================= d. LINK CHECKER
    // A links to us in the article, B only in the footer
    mock.links.set(hostA, "body");
    mock.links.set(hostB, "footer");

    console.log("Running: 4. Link checker");
    const linkRun = await runWorkflow(linkChecker, NodeType.SCHEDULE_TRIGGER);

    await check("d1", "A page with our link in the article is marked linked", () => {
      expect(linkRun.ok, linkRun.error);
      expect(rowA?.fields.status === "linked", `row ${hostA} has status "${rowA?.fields.status}"`);
    });
    await check("d2", "A page with our link only in the footer is marked linked", () => {
      expect(linkRun.ok, linkRun.error);
      expect(rowB?.fields.status === "linked", `row ${hostB} has status "${rowB?.fields.status}"`);
    });
    await check("d3", "A page without our link is left as it was", () => {
      expect(linkRun.ok, linkRun.error);
      expect(seeded.fields.status === "sent", `row ${EXISTING_SITE.host} has status "${seeded.fields.status}"`);
    });

    // ================================================ e. A LONG AIRTABLE LIST
    // 250 rows, more than the 100 Airtable gives per request
    for (let index = 0; index < 250; index++) addRecord("Long", { n: index, status: index < 120 ? "open" : "done" });

    const listNode = (key: string, extra: Record<string, unknown>): NodeSpec => ({
      key,
      name: `List (${key})`,
      type: "AIRTABLE",
      data: airtable("list_records", "Long", { variableName: key, ...extra }),
    });

    const longList = await createWorkflow(
      "Backlinks 5: A long Airtable list",
      [
        { key: "start", name: "Manual Trigger", type: "MANUAL_TRIGGER" },
        listNode("onePage", {}),
        listNode("everything", { returnAll: "yes" }),
        listNode("capped", { returnAll: "yes", maxRecords: "230" }),
        listNode("filtered", { returnAll: "yes", filterByFormula: "{status}='open'" }),
        { key: "split", name: "Split Out rows", type: "SPLIT_OUT", data: { variableName: "rows", inputPath: "everything", field: "records" } },
      ],
      [
        ["start", "onePage"],
        ["onePage", "everything"],
        ["everything", "capped"],
        ["capped", "filtered"],
        ["filtered", "split"],
      ]
    );

    console.log("Running: 5. A long Airtable list");
    mock.airtablePages.length = 0;
    const longRun = await runWorkflow(longList, NodeType.MANUAL_TRIGGER);
    const longOutput = ((
      await prisma.execution.findUnique({ where: { id: longRun.executionId }, select: { output: true } })
    )?.output ?? {}) as Record<string, { count?: number; truncated?: boolean; warning?: string; items?: unknown[] }>;

    await check("e1", "Airtable Return All reads every page (250 rows), and the list splits into items", () => {
      expect(longRun.ok, longRun.error);
      expect(longOutput.onePage?.count === 50, `without Return All the node returned ${longOutput.onePage?.count} rows instead of 50`);
      expect(longOutput.everything?.count === 250, `Return All returned ${longOutput.everything?.count} of 250 rows`);
      expect(longOutput.everything?.truncated === false, "a complete list is marked as truncated");
      expect(longOutput.filtered?.count === 120, `Return All with a filter returned ${longOutput.filtered?.count} of 120 rows`);
      expect(longOutput.rows?.items?.length === 250, `Split Out made ${longOutput.rows?.items?.length} items`);
      expect(
        mock.airtablePages.join() === "Long@0,Long@0,Long@100,Long@200,Long@0,Long@100,Long@200,Long@0,Long@100",
        `the pages asked for were: ${mock.airtablePages.join(", ")}`
      );
    });
    await check("e2", "A list cut at Max Records says so in its output", () => {
      expect(longRun.ok, longRun.error);
      expect(longOutput.capped?.count === 230, `Max Records 230 returned ${longOutput.capped?.count} rows`);
      expect(longOutput.capped?.truncated === true, "the cut list is not marked as truncated");
      expect(
        /Only the first 230 records were returned/.test(longOutput.capped?.warning ?? ""),
        `its warning is: ${longOutput.capped?.warning ?? "(none)"}`
      );
      expect(
        /more than the \d+ items a node after Split Out handles/.test(longOutput.everything?.warning ?? ""),
        `a list longer than the per-node item limit has this warning: ${longOutput.everything?.warning ?? "(none)"}`
      );
    });

    // ========================================================== API keys
    await check("z2", "The key sent in the address (Query Auth) is stored nowhere readable", async () => {
      const mine = { workflow: { userId: user.id } };
      const stored = JSON.stringify({
        nodes: await prisma.node.findMany({ where: mine, select: { data: true } }),
        executions: await prisma.execution.findMany({
          where: mine,
          select: { inputData: true, output: true, error: true, errorStack: true },
        }),
        executionNodes: await prisma.executionNode.findMany({
          where: { execution: mine },
          select: { input: true, output: true, error: true, errorStack: true },
        }),
      });

      // The mock only answers "valid" when it was given the key
      expect(created.length === 3, "ZeroBounce did not accept the key, so no prospect was saved");
      expect(stored.includes("/zerobounce/v2/validate?"), "the address ZeroBounce repeated was not stored at all, so this proves nothing");
      expect(!stored.includes(KEYS.zeroBounce), "the ZeroBounce key is in a node's settings or in what was stored about a run");

      for (const key of [KEYS.tavily, KEYS.airtable, KEYS.hunter, KEYS.model]) {
        expect(!stored.includes(key), `another credential's value (${key.slice(0, 4)}...) was stored`);
      }
    });

    // ============================================================ the test
    await check("z1", "Nothing left this machine, and the mock answered everything", () => {
      expect(blocked.length === 0, `refused outside requests: ${blocked.join("; ")}`);
      expect(mock.unexpected.length === 0, `requests the mock could not answer: ${mock.unexpected.join("; ")}`);
    });
  } finally {
    // Workflows, executions, credentials and usage rows go with the user
    await prisma.user.deleteMany({ where: { id: user.id } });
    await prisma.$disconnect();
    network.close();
    server.close();
  }

  printResults();
  if (results.some((result) => !result.passed)) process.exitCode = 1;
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  // The engine's HTTP agents keep sockets open
  .finally(() => process.exit());
