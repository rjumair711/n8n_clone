import type { NodeExecutor, WorkflowContext } from "@/features/executions/types";
import { NonRetriableError } from "inngest";
import ky from "ky";
import { createConnection, type ResultSetHeader } from "mysql2/promise";
import { BlockedRequestError, assertPublicHost, safeFetch } from "@/lib/ssrf";
import { fetchFeed } from "@/lib/rss";
import { renderTemplate } from "../../lib/templates";
import { getValueByPath } from "../../lib/conditions";
import {
  loadCredentialSecret,
  parseJsonField,
  toIntegrationError,
} from "../../lib/integration";
import {
  applyEditFields,
  convertFieldValue,
  parseAssignments,
  type IncludeMode,
} from "../../lib/edit-fields";
import { parseFieldList } from "../../lib/list-ops";
import { resolveQueryParameters, resolveQueryText } from "../../lib/sql-safety";
import { loadFiles, resolveFileIds } from "../files/executors";

type AppData = {
  variableName?: string;
  credentialId?: string;
  operation?: string;
  [key: string]: string | undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

// Shared start of every app node: the checks, and a way to read a field
const prepare = (label: string, data: AppData, context: WorkflowContext) => {
  if (!data.variableName) {
    throw new NonRetriableError(`${label} node: Variable name is missing`);
  }

  const field = (name: string) => renderTemplate(data[name], context).trim();

  const required = (name: string, title: string) => {
    const value = field(name);
    if (!value) {
      throw new NonRetriableError(`${label} node: ${title} is required`);
    }
    return value;
  };

  // An optional field holding a JSON object
  const jsonObject = (name: string, title: string): Record<string, unknown> => {
    const text = field(name);
    if (!text) return {};

    const parsed = parseJsonField<unknown>(label, title, text);
    if (!isRecord(parsed)) {
      throw new NonRetriableError(`${label} node: ${title} must be a JSON object`);
    }
    return parsed;
  };

  return { variableName: data.variableName, field, required, jsonObject };
};

const splitAddresses = (text: string) =>
  text
    .split(/[,;]/)
    .map((address) => address.trim())
    .filter(Boolean);

// =========================================================================
// EDIT FIELDS
// =========================================================================
type EditFieldsData = {
  variableName?: string;
  inputPath?: string;
  include?: string;
  fieldList?: string;
  assignments?: string;
  renames?: string;
};

/**
 * Builds an object from an existing one: set, keep, remove and rename
 * fields (n8n's Edit Fields). After a list node it runs for every item and
 * reshapes that item, which makes it the "map" step of a list.
 */
export const editFieldsExecutor: NodeExecutor<EditFieldsData> = async ({
  data,
  context,
}) => {
  const variableName = data.variableName?.trim();
  if (!variableName) {
    throw new NonRetriableError("Edit Fields node: Variable name is missing");
  }

  const inputPath = data.inputPath?.trim();

  // Without a named input: the current item of a list, else a new object
  const source = inputPath
    ? getValueByPath(context, inputPath)
    : "itemIndex" in context
      ? context.item
      : {};

  if (inputPath && source === undefined) {
    throw new NonRetriableError(
      `Edit Fields node: "${inputPath}" does not exist`
    );
  }

  if (source !== undefined && source !== null && !isRecord(source)) {
    throw new NonRetriableError(
      `Edit Fields node: the input must be an object, not ${Array.isArray(source) ? "a list (add a Split Out node before it)" : `a ${typeof source}`}`
    );
  }

  try {
    const output = applyEditFields({
      input: (source ?? {}) as Record<string, unknown>,
      include: (data.include || "all") as IncludeMode,
      fieldList: parseFieldList(renderTemplate(data.fieldList, context)),
      renames: parseAssignments(data.renames).map((rename) => ({
        from: rename.name,
        to: renderTemplate(rename.value, context).trim(),
      })),
      // Each value is rendered on its own, so a value containing line
      // breaks cannot be mistaken for more fields
      values: parseAssignments(data.assignments).map((assignment) => ({
        name: assignment.name,
        value: convertFieldValue(
          assignment.name,
          assignment.type,
          renderTemplate(assignment.value, context)
        ),
      })),
    });

    return { ...context, [variableName]: output };
  } catch (error: any) {
    throw new NonRetriableError(`Edit Fields node: ${error.message}`);
  }
};

// =========================================================================
// TWILIO
// =========================================================================
export const twilioExecutor: NodeExecutor<AppData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
}) => {
  const { variableName, required, field } = prepare("Twilio", data, context);
  const operation = data.operation || "send_sms";

  if (operation !== "send_sms" && operation !== "send_whatsapp") {
    throw new NonRetriableError(`Twilio node: Unsupported operation "${operation}"`);
  }

  // WhatsApp numbers are addressed as "whatsapp:+9230..."
  const address = (number: string) =>
    operation === "send_whatsapp" && !number.startsWith("whatsapp:")
      ? `whatsapp:${number}`
      : number;

  const body = new URLSearchParams({
    To: address(required("to", "To")),
    From: address(required("from", "From")),
    Body: required("message", "Message"),
  });

  const mediaUrl = field("mediaUrl");
  if (mediaUrl) body.set("MediaUrl", mediaUrl);

  // Stored as "AccountSID:AuthToken"
  const secret = await loadCredentialSecret({
    step,
    stepId: `twilio-${nodeId}-get-credential`,
    credentialId: data.credentialId,
    userId,
    label: "Twilio",
  });

  const separator = secret.indexOf(":");
  const accountSid = secret.slice(0, separator).trim();

  if (separator <= 0 || !/^AC[0-9a-f]{32}$/i.test(accountSid)) {
    throw new NonRetriableError(
      'Twilio node: the credential must look like "ACxxxxxxxx:your-auth-token"'
    );
  }

  try {
    const result = await step.run(`twilio-${nodeId}-${operation}`, async () => {
      const message: any = await ky
        .post(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
          {
            headers: {
              Authorization: `Basic ${Buffer.from(secret, "utf8").toString("base64")}`,
            },
            body,
          }
        )
        .json();

      return {
        sid: message.sid,
        status: message.status,
        to: message.to,
        from: message.from,
        body: message.body,
      };
    });

    return { ...context, [variableName]: result };
  } catch (error: any) {
    throw await toIntegrationError("Twilio", error);
  }
};

// =========================================================================
// JIRA (Cloud)
// =========================================================================
const summarizeJiraIssue = (issue: any, baseUrl: string) => ({
  id: issue.id,
  key: issue.key,
  url: `${baseUrl}/browse/${issue.key}`,
  summary: issue.fields?.summary,
  status: issue.fields?.status?.name,
  type: issue.fields?.issuetype?.name,
  priority: issue.fields?.priority?.name,
  assignee: issue.fields?.assignee?.displayName ?? null,
  created: issue.fields?.created,
  updated: issue.fields?.updated,
});

// Jira Cloud's rich text format: one paragraph per line of plain text
const toJiraDocument = (text: string) => ({
  type: "doc",
  version: 1,
  content: text.split(/\r?\n/).map((line) => ({
    type: "paragraph",
    content: line ? [{ type: "text", text: line }] : [],
  })),
});

export const jiraExecutor: NodeExecutor<AppData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
}) => {
  const { variableName, required, field, jsonObject } = prepare("Jira", data, context);
  const operation = data.operation || "create_issue";

  const domain = required("domain", "Domain")
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "");

  if (!/^[a-z0-9.-]+$/i.test(domain)) {
    throw new NonRetriableError(
      "Jira node: Domain must look like yourcompany.atlassian.net"
    );
  }

  const baseUrl = `https://${domain}`;

  let request: { method: string; path: string; body?: unknown };
  let shape: (response: any) => unknown;

  switch (operation) {
    case "create_issue": {
      const description = field("description");

      request = {
        method: "POST",
        path: "/rest/api/3/issue",
        body: {
          fields: {
            project: { key: required("projectKey", "Project Key") },
            issuetype: { name: field("issueType") || "Task" },
            summary: required("summary", "Summary"),
            ...(description ? { description: toJiraDocument(description) } : {}),
            ...jsonObject("fieldsJson", "Additional Fields"),
          },
        },
      };
      shape = (response) => ({
        id: response.id,
        key: response.key,
        url: `${baseUrl}/browse/${response.key}`,
      });
      break;
    }

    case "get_issue":
      request = {
        method: "GET",
        path: `/rest/api/3/issue/${encodeURIComponent(required("issueKey", "Issue Key"))}`,
      };
      shape = (response) => summarizeJiraIssue(response, baseUrl);
      break;

    case "search_issues":
      request = {
        method: "POST",
        path: "/rest/api/3/search/jql",
        body: {
          jql: required("jql", "JQL"),
          maxResults: Math.min(Math.max(Number(field("limit")) || 20, 1), 100),
          fields: [
            "summary",
            "status",
            "issuetype",
            "priority",
            "assignee",
            "created",
            "updated",
          ],
        },
      };
      shape = (response) => {
        const issues = (response.issues ?? []).map((issue: any) =>
          summarizeJiraIssue(issue, baseUrl)
        );
        return { issues, count: issues.length };
      };
      break;

    case "add_comment":
      request = {
        method: "POST",
        path: `/rest/api/3/issue/${encodeURIComponent(required("issueKey", "Issue Key"))}/comment`,
        body: { body: toJiraDocument(required("comment", "Comment")) },
      };
      shape = (response) => ({ id: response.id, created: response.created });
      break;

    default:
      throw new NonRetriableError(`Jira node: Unsupported operation "${operation}"`);
  }

  // Stored as "email:api-token"
  const secret = await loadCredentialSecret({
    step,
    stepId: `jira-${nodeId}-get-credential`,
    credentialId: data.credentialId,
    userId,
    label: "Jira",
  });

  if (!secret.includes(":")) {
    throw new NonRetriableError(
      'Jira node: the credential must look like "you@company.com:your-api-token"'
    );
  }

  try {
    const result = await step.run(`jira-${nodeId}-${operation}`, async () => {
      // The domain is typed in by the user, so it gets the SSRF guard
      const response = await safeFetch(`${baseUrl}${request.path}`, {
        method: request.method,
        headers: {
          Authorization: `Basic ${Buffer.from(secret, "utf8").toString("base64")}`,
          Accept: "application/json",
          ...(request.body ? { "Content-Type": "application/json" } : {}),
        },
        body: request.body ? JSON.stringify(request.body) : undefined,
        signal: AbortSignal.timeout(30_000),
      });

      const text = await response.text();
      let payload: any = {};
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        // Not JSON (a login page, for example): reported below
      }

      if (!response.ok) {
        const detail =
          [
            ...(payload.errorMessages ?? []),
            ...Object.entries(payload.errors ?? {}).map(
              ([name, message]) => `${name}: ${message}`
            ),
          ].join("; ") || text.slice(0, 200);

        throw new NonRetriableError(
          `Jira API error [${response.status}]: ${detail || response.statusText}`
        );
      }

      return shape(payload);
    });

    return { ...context, [variableName]: result };
  } catch (error: any) {
    if (error instanceof NonRetriableError) throw error;
    if (error instanceof BlockedRequestError) {
      throw new NonRetriableError(`Jira node: ${error.message}`);
    }
    throw new NonRetriableError(`Jira node failed: ${error?.message}`);
  }
};

// =========================================================================
// HUBSPOT
// =========================================================================
const HUBSPOT_API = "https://api.hubapi.com/crm/v3/objects";

const summarizeHubspotObject = (object: any) => ({
  id: object.id,
  ...object.properties,
  createdAt: object.createdAt,
  updatedAt: object.updatedAt,
});

const CONTACT_PROPERTIES = "email,firstname,lastname,phone,company,lifecyclestage";

export const hubspotExecutor: NodeExecutor<AppData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
}) => {
  const { variableName, required, field, jsonObject } = prepare("HubSpot", data, context);
  const operation = data.operation || "create_contact";

  // Only the properties that were filled in are sent
  const contactProperties = () => ({
    ...Object.fromEntries(
      [
        ["email", field("email")],
        ["firstname", field("firstName")],
        ["lastname", field("lastName")],
        ["phone", field("phone")],
      ].filter(([, value]) => value)
    ),
    ...jsonObject("propertiesJson", "Additional Properties"),
  });

  // A contact is addressed by its id, or by its email address
  const contactPath = () => {
    const id = required("contactId", "Contact ID or Email");

    return `${HUBSPOT_API}/contacts/${encodeURIComponent(id)}${id.includes("@") ? "?idProperty=email" : ""}`;
  };

  let request: { method: "get" | "post" | "patch"; url: string; json?: unknown };
  let shape: (response: any) => unknown = summarizeHubspotObject;

  switch (operation) {
    case "create_contact":
      required("email", "Email");
      request = {
        method: "post",
        url: `${HUBSPOT_API}/contacts`,
        json: { properties: contactProperties() },
      };
      break;

    case "get_contact": {
      const path = contactPath();
      request = {
        method: "get",
        url: `${path}${path.includes("?") ? "&" : "?"}properties=${CONTACT_PROPERTIES}`,
      };
      break;
    }

    case "update_contact": {
      const properties = contactProperties();
      if (Object.keys(properties).length === 0) {
        throw new NonRetriableError(
          "HubSpot node: fill in at least one property to update"
        );
      }
      request = { method: "patch", url: contactPath(), json: { properties } };
      break;
    }

    case "search_contacts":
      request = {
        method: "post",
        url: `${HUBSPOT_API}/contacts/search`,
        json: {
          query: required("query", "Search"),
          limit: Math.min(Math.max(Number(field("limit")) || 10, 1), 100),
          properties: CONTACT_PROPERTIES.split(","),
        },
      };
      shape = (response) => {
        const contacts = (response.results ?? []).map(summarizeHubspotObject);
        return { contacts, count: contacts.length, total: response.total };
      };
      break;

    case "create_deal": {
      const amount = field("amount");
      const stage = field("dealStage");

      request = {
        method: "post",
        url: `${HUBSPOT_API}/deals`,
        json: {
          properties: {
            dealname: required("dealName", "Deal Name"),
            ...(amount ? { amount } : {}),
            ...(stage ? { dealstage: stage } : {}),
            ...jsonObject("propertiesJson", "Additional Properties"),
          },
        },
      };
      break;
    }

    default:
      throw new NonRetriableError(`HubSpot node: Unsupported operation "${operation}"`);
  }

  const token = await loadCredentialSecret({
    step,
    stepId: `hubspot-${nodeId}-get-credential`,
    credentialId: data.credentialId,
    userId,
    label: "HubSpot",
  });

  try {
    const result = await step.run(`hubspot-${nodeId}-${operation}`, async () => {
      const response = await ky(request.url, {
        method: request.method,
        headers: { Authorization: `Bearer ${token}` },
        ...(request.json ? { json: request.json } : {}),
      }).json();

      return shape(response);
    });

    return { ...context, [variableName]: result };
  } catch (error: any) {
    throw await toIntegrationError("HubSpot", error);
  }
};

// =========================================================================
// RESEND
// =========================================================================
export const resendExecutor: NodeExecutor<AppData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
}) => {
  const { variableName, required, field } = prepare("Resend", data, context);

  const message = renderTemplate(data.message, context);
  if (!message.trim()) {
    throw new NonRetriableError("Resend node: Message is required");
  }

  const cc = splitAddresses(field("cc"));
  const bcc = splitAddresses(field("bcc"));
  const replyTo = field("replyTo");

  const payload = {
    from: required("from", "From"),
    to: splitAddresses(required("to", "To")),
    subject: required("subject", "Subject"),
    ...(data.emailType === "html" ? { html: message } : { text: message }),
    ...(cc.length ? { cc } : {}),
    ...(bcc.length ? { bcc } : {}),
    ...(replyTo ? { reply_to: replyTo } : {}),
  };

  const resendAttachmentIds = resolveFileIds("Resend", context, data.attachments);

  const apiKey = await loadCredentialSecret({
    step,
    stepId: `resend-${nodeId}-get-credential`,
    credentialId: data.credentialId,
    userId,
    label: "Resend",
  });

  try {
    const result = await step.run(`resend-${nodeId}-send`, async () => {
      const attachments = (
        await loadFiles("Resend", resendAttachmentIds, userId)
      ).map((file) => ({
        filename: file.fileName,
        content: file.data.toString("base64"),
        content_type: file.mimeType,
      }));

      const response: any = await ky
        .post("https://api.resend.com/emails", {
          headers: { Authorization: `Bearer ${apiKey}` },
          json: attachments.length ? { ...payload, attachments } : payload,
        })
        .json();

      return { id: response.id, to: payload.to };
    });

    return { ...context, [variableName]: result };
  } catch (error: any) {
    throw await toIntegrationError("Resend", error);
  }
};

// =========================================================================
// SENDGRID
// =========================================================================
// "Name <address@example.com>" or just the address
const toSendgridAddress = (text: string) => {
  const match = text.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);

  return match
    ? { email: match[2].trim(), ...(match[1] ? { name: match[1].replace(/^"|"$/g, "") } : {}) }
    : { email: text.trim() };
};

export const sendgridExecutor: NodeExecutor<AppData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
}) => {
  const { variableName, required, field } = prepare("SendGrid", data, context);

  const message = renderTemplate(data.message, context);
  if (!message.trim()) {
    throw new NonRetriableError("SendGrid node: Message is required");
  }

  const to = splitAddresses(required("to", "To")).map(toSendgridAddress);
  const cc = splitAddresses(field("cc")).map(toSendgridAddress);
  const bcc = splitAddresses(field("bcc")).map(toSendgridAddress);
  const replyTo = field("replyTo");

  const payload = {
    personalizations: [
      {
        to,
        ...(cc.length ? { cc } : {}),
        ...(bcc.length ? { bcc } : {}),
      },
    ],
    from: toSendgridAddress(required("from", "From")),
    subject: required("subject", "Subject"),
    ...(replyTo ? { reply_to: toSendgridAddress(replyTo) } : {}),
    content: [
      {
        type: data.emailType === "html" ? "text/html" : "text/plain",
        value: message,
      },
    ],
  };

  const sendgridAttachmentIds = resolveFileIds("SendGrid", context, data.attachments);

  const apiKey = await loadCredentialSecret({
    step,
    stepId: `sendgrid-${nodeId}-get-credential`,
    credentialId: data.credentialId,
    userId,
    label: "SendGrid",
  });

  try {
    const result = await step.run(`sendgrid-${nodeId}-send`, async () => {
      const attachments = (
        await loadFiles("SendGrid", sendgridAttachmentIds, userId)
      ).map((file) => ({
        filename: file.fileName,
        content: file.data.toString("base64"),
        type: file.mimeType,
        disposition: "attachment",
      }));

      // Answers 202 with an empty body; the id is in a header
      const response = await ky.post("https://api.sendgrid.com/v3/mail/send", {
        headers: { Authorization: `Bearer ${apiKey}` },
        json: attachments.length ? { ...payload, attachments } : payload,
      });

      return {
        accepted: true,
        messageId: response.headers.get("x-message-id"),
        to: to.map((address) => address.email),
      };
    });

    return { ...context, [variableName]: result };
  } catch (error: any) {
    if (error?.response) {
      // SendGrid lists its reasons under "errors"
      const body = await error.response.clone().json().catch(() => ({}));
      const detail = (body?.errors ?? [])
        .map((entry: any) => entry.message)
        .filter(Boolean)
        .join("; ");

      if (detail) {
        throw new NonRetriableError(
          `SendGrid API error [${error.response.status}]: ${detail}`
        );
      }
    }

    throw await toIntegrationError("SendGrid", error);
  }
};

// =========================================================================
// MYSQL
// =========================================================================
const MYSQL_MAX_ROWS = 500;
const MYSQL_CONNECT_TIMEOUT_MS = 10_000;
const MYSQL_QUERY_TIMEOUT_MS = 20_000;

// Table and column names cannot be query parameters, so they are quoted
const quoteMysqlIdentifier = (identifier: string) =>
  identifier
    .split(".")
    .map((part) => `\`${part.trim().replace(/`/g, "``")}\``)
    .join(".");

export const mysqlExecutor: NodeExecutor<AppData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
}) => {
  const { variableName, required, field } = prepare("MySQL", data, context);
  const operation = data.operation || "execute_query";

  // Build the statement first so configuration mistakes fail before connecting
  let sql: string;
  let values: unknown[] = [];

  switch (operation) {
    case "execute_query":
      // Expressions in the SQL itself are refused unless the node allows
      // them; values go through Query Parameters, which mysql2 escapes
      sql = resolveQueryText(
        "MySQL",
        { query: data.query, allowQueryExpressions: data.allowQueryExpressions },
        context
      );
      values = resolveQueryParameters("MySQL", data.paramsJson, context);
      break;

    case "select_rows":
      sql = `SELECT * FROM ${quoteMysqlIdentifier(required("table", "Table"))} LIMIT ?`;
      values = [Math.min(Math.max(Number(field("limit")) || 50, 1), MYSQL_MAX_ROWS)];
      break;

    case "insert_row": {
      const table = required("table", "Table");
      const row = parseJsonField<Record<string, unknown>>(
        "MySQL",
        "Row JSON",
        field("rowJson") || "{}"
      );
      const columns = isRecord(row) ? Object.keys(row) : [];

      if (columns.length === 0) {
        throw new NonRetriableError(
          "MySQL node: Row JSON needs at least one column"
        );
      }

      sql = `INSERT INTO ${quoteMysqlIdentifier(table)} (${columns
        .map(quoteMysqlIdentifier)
        .join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
      values = columns.map((column) => {
        const value = row[column];
        // Objects and lists are stored as JSON text
        return isRecord(value) || Array.isArray(value) ? JSON.stringify(value) : value;
      });
      break;
    }

    default:
      throw new NonRetriableError(`MySQL node: Unsupported operation "${operation}"`);
  }

  const connectionString = await loadCredentialSecret({
    step,
    stepId: `mysql-${nodeId}-get-credential`,
    credentialId: data.credentialId,
    userId,
    label: "MySQL",
  });

  let host: string;
  try {
    const url = new URL(connectionString);
    if (url.protocol !== "mysql:") throw new Error("not a mysql URL");
    host = url.hostname;
  } catch {
    throw new NonRetriableError(
      "MySQL node: the credential must be a connection string like mysql://user:password@host:3306/database"
    );
  }

  try {
    const result = await step.run(`mysql-${nodeId}-${operation}`, async () => {
      // The host comes from the user: never connect into a private network
      await assertPublicHost(host);

      const connection = await createConnection({
        uri: connectionString,
        connectTimeout: MYSQL_CONNECT_TIMEOUT_MS,
        // One statement per query, so a rendered value cannot add another
        multipleStatements: false,
      });

      try {
        const [response] = await connection.query({
          sql,
          values,
          timeout: MYSQL_QUERY_TIMEOUT_MS,
        });

        if (Array.isArray(response)) {
          return {
            rows: response.slice(0, MYSQL_MAX_ROWS),
            rowCount: response.length,
            truncated: response.length > MYSQL_MAX_ROWS,
          };
        }

        // INSERT / UPDATE / DELETE
        const header = response as ResultSetHeader;

        return {
          rows: [],
          rowCount: header.affectedRows,
          insertId: header.insertId || null,
          truncated: false,
        };
      } finally {
        await connection.end().catch(() => {});
      }
    });

    return { ...context, [variableName]: result };
  } catch (error: any) {
    if (error instanceof NonRetriableError) throw error;

    throw new NonRetriableError(
      error instanceof BlockedRequestError
        ? `MySQL node: ${error.message}`
        : `MySQL node failed: ${error.message}`
    );
  }
};

// =========================================================================
// RSS READ
// =========================================================================
const RSS_MAX_ITEMS = 100;

/**
 * Reads an RSS or Atom feed. Its items go on as a list, so the nodes
 * connected after it run once per item.
 */
export const rssReadExecutor: NodeExecutor<AppData> = async ({
  data,
  nodeId,
  context,
  step,
}) => {
  const { variableName, required, field } = prepare("RSS Read", data, context);

  const url = required("url", "Feed URL");
  if (!/^https?:\/\//i.test(url)) {
    throw new NonRetriableError(
      "RSS Read node: Feed URL must start with http:// or https://"
    );
  }

  const limit = Math.min(
    Math.max(Number(field("limit")) || 20, 1),
    RSS_MAX_ITEMS
  );

  try {
    const result = await step.run(`rss-read-${nodeId}`, async () => {
      const feed = await fetchFeed(url);
      const items = feed.items.slice(0, limit);

      return {
        title: feed.title,
        link: feed.link,
        description: feed.description,
        items,
        count: items.length,
      };
    });

    return { ...context, [variableName]: result };
  } catch (error: any) {
    if (error instanceof NonRetriableError) throw error;

    throw new NonRetriableError(
      error?.name === "TimeoutError"
        ? "RSS Read node failed: the feed did not answer in time"
        : `RSS Read node failed: ${error?.message}${error?.cause?.message ? ` (${error.cause.message})` : ""}`
    );
  }
};
