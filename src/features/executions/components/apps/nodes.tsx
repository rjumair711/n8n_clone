"use client";

import { CredentialType } from "@prisma/client";
import { PencilRuler, Rss } from "lucide-react";
import { createIntegrationNode } from "../integration-node";
import type { IntegrationConfig, IntegrationField } from "../integration-dialog";
import {
  ALLOW_QUERY_EXPRESSIONS_LABEL,
  QUERY_EXPRESSION_WARNING,
  hasQueryExpressions,
} from "../../lib/sql-expressions";

const operationLabel = (config: IntegrationConfig, value?: string) =>
  config.operations?.find((option) => option.value === value)?.label;

// =========================================================================
// EDIT FIELDS
// =========================================================================
export const editFieldsConfig: IntegrationConfig = {
  label: "Edit Fields",
  description:
    "Set, keep, remove and rename the fields of an object. After a list node it reshapes every item, like a map.",
  logo: PencilRuler,
  defaultVariableName: "fields",
  hint: "The result is at {{json <name>}}, and its fields at {{<name>.fieldName}}. Values support {{variables}}; inside a list use {{item.name}} or {{ $json.name }}.",
  fields: [
    {
      name: "assignments",
      label: "Fields To Set",
      type: "textarea",
      placeholder:
        "fullName = {{item.firstName}} {{item.lastName}}\ntotal (number) = {{ $json.price * $json.quantity }}\npaid (boolean) = true\naddress.city = Lahore",
      description:
        "One per line, as name = value. Add a type in brackets for number, boolean or json; a dot in the name makes a nested field.",
    },
    {
      name: "include",
      label: "Include Other Input Fields",
      type: "select",
      defaultValue: "all",
      required: true,
      options: [
        { value: "all", label: "All" },
        { value: "none", label: "None (only the fields set above)" },
        { value: "selected", label: "Only the fields listed below" },
        { value: "except", label: "All except the fields listed below" },
      ],
    },
    {
      name: "fieldList",
      label: "Fields To Keep Or Remove",
      placeholder: "id, email, address.city",
      description: "Comma-separated. Used by the last two Include options.",
    },
    {
      name: "renames",
      label: "Fields To Rename",
      type: "textarea",
      placeholder: "first_name = firstName\nmail = email",
      description: "One per line, as oldName = newName.",
    },
    {
      name: "inputPath",
      label: "Input Object",
      placeholder: "myApiCall.httpResponse.data",
      description:
        "The object to start from. Leave empty to use the current item of a list, or to start with an empty object.",
    },
  ],
};

export const EditFieldsNode = createIntegrationNode(editFieldsConfig, (data) => {
  const count = (data.assignments || "").split(/\r?\n/).filter((line) => line.trim()).length;

  return count ? `Set ${count} field${count === 1 ? "" : "s"}` : "Reshape fields";
});

// =========================================================================
// TWILIO
// =========================================================================
export const twilioConfig: IntegrationConfig = {
  label: "Twilio",
  description: "Send SMS and WhatsApp messages with Twilio.",
  logo: "/logos/twilio.svg",
  credentialType: CredentialType.TWILIO,
  credentialLabel: "Twilio Credential",
  defaultVariableName: "twilio",
  operations: [
    { value: "send_sms", label: "Send SMS" },
    { value: "send_whatsapp", label: "Send WhatsApp Message" },
  ],
  fields: [
    {
      name: "from",
      label: "From",
      placeholder: "+15551234567",
      description:
        "One of your Twilio numbers, with country code. For WhatsApp, your Twilio WhatsApp sender.",
      required: true,
    },
    {
      name: "to",
      label: "To",
      placeholder: "+923001234567",
      description: "The recipient's number with country code.",
      required: true,
    },
    {
      name: "message",
      label: "Message",
      type: "textarea",
      placeholder: "Hi {{webhook.body.name}}, your order is on its way.",
      required: true,
    },
    {
      name: "mediaUrl",
      label: "Media URL",
      placeholder: "https://example.com/receipt.png",
      description: "A public link to an image or file to attach.",
    },
  ],
};

export const TwilioNode = createIntegrationNode(twilioConfig, (data) =>
  data.to ? `To: ${data.to}` : undefined
);

// =========================================================================
// JIRA
// =========================================================================
export const jiraConfig: IntegrationConfig = {
  label: "Jira",
  description: "Create, read and search issues in Jira Cloud.",
  logo: "/logos/jira.svg",
  credentialType: CredentialType.JIRA,
  credentialLabel: "Jira Credential",
  defaultVariableName: "jira",
  operations: [
    { value: "create_issue", label: "Create Issue" },
    { value: "get_issue", label: "Get Issue" },
    { value: "search_issues", label: "Search Issues (JQL)" },
    { value: "add_comment", label: "Add Comment" },
  ],
  fields: [
    {
      name: "domain",
      label: "Domain",
      placeholder: "yourcompany.atlassian.net",
      required: true,
    },
    {
      name: "projectKey",
      label: "Project Key",
      placeholder: "SUP",
      description: "The short code in front of issue numbers, as in SUP-12.",
      required: true,
      operations: ["create_issue"],
    },
    {
      name: "issueType",
      label: "Issue Type",
      placeholder: "Task",
      defaultValue: "Task",
      description: "Exactly as it is named in the project: Task, Bug, Story...",
      operations: ["create_issue"],
    },
    {
      name: "summary",
      label: "Summary",
      placeholder: "Checkout fails for {{webhook.body.email}}",
      required: true,
      operations: ["create_issue"],
    },
    {
      name: "description",
      label: "Description",
      type: "textarea",
      placeholder: "What happened, and how to reproduce it.",
      operations: ["create_issue"],
    },
    {
      name: "fieldsJson",
      label: "Additional Fields",
      type: "textarea",
      placeholder: '{\n  "labels": ["from-rxj"],\n  "priority": { "name": "High" }\n}',
      description: "A JSON object in Jira's field format, merged into the issue.",
      operations: ["create_issue"],
    },
    {
      name: "issueKey",
      label: "Issue Key",
      placeholder: "SUP-12",
      required: true,
      operations: ["get_issue", "add_comment"],
    },
    {
      name: "comment",
      label: "Comment",
      type: "textarea",
      placeholder: "The customer replied: {{gmail.snippet}}",
      required: true,
      operations: ["add_comment"],
    },
    {
      name: "jql",
      label: "JQL",
      placeholder: 'project = SUP AND status = "To Do" ORDER BY created DESC',
      required: true,
      operations: ["search_issues"],
    },
    {
      name: "limit",
      label: "Limit",
      placeholder: "20",
      description: "How many issues to return (up to 100).",
      operations: ["search_issues"],
    },
  ],
};

export const JiraNode = createIntegrationNode(jiraConfig, (data) =>
  data.issueKey || data.projectKey
    ? `${operationLabel(jiraConfig, data.operation) ?? "Jira"}: ${data.issueKey || data.projectKey}`
    : undefined
);

// =========================================================================
// HUBSPOT
// =========================================================================
const contactFields = (operations: string[]): IntegrationField[] => [
  { name: "firstName", label: "First Name", placeholder: "Ali", operations },
  { name: "lastName", label: "Last Name", placeholder: "Khan", operations },
  { name: "phone", label: "Phone", placeholder: "+923001234567", operations },
];

export const hubspotConfig: IntegrationConfig = {
  label: "HubSpot",
  description: "Work with contacts and deals in HubSpot CRM.",
  logo: "/logos/hubspot.svg",
  credentialType: CredentialType.HUBSPOT,
  credentialLabel: "HubSpot Credential",
  defaultVariableName: "hubspot",
  operations: [
    { value: "create_contact", label: "Create Contact" },
    { value: "get_contact", label: "Get Contact" },
    { value: "update_contact", label: "Update Contact" },
    { value: "search_contacts", label: "Search Contacts" },
    { value: "create_deal", label: "Create Deal" },
  ],
  fields: [
    {
      name: "contactId",
      label: "Contact ID or Email",
      placeholder: "{{webhook.body.email}}",
      required: true,
      operations: ["get_contact", "update_contact"],
    },
    {
      name: "email",
      label: "Email",
      placeholder: "customer@example.com",
      required: true,
      operations: ["create_contact"],
    },
    {
      name: "email",
      label: "New Email",
      placeholder: "customer@example.com",
      operations: ["update_contact"],
    },
    ...contactFields(["create_contact", "update_contact"]),
    {
      name: "query",
      label: "Search",
      placeholder: "ali@example.com",
      description: "Matches names, emails, phone numbers and companies.",
      required: true,
      operations: ["search_contacts"],
    },
    {
      name: "limit",
      label: "Limit",
      placeholder: "10",
      operations: ["search_contacts"],
    },
    {
      name: "dealName",
      label: "Deal Name",
      placeholder: "Website redesign for {{webhook.body.company}}",
      required: true,
      operations: ["create_deal"],
    },
    {
      name: "amount",
      label: "Amount",
      placeholder: "1500",
      operations: ["create_deal"],
    },
    {
      name: "dealStage",
      label: "Deal Stage",
      placeholder: "appointmentscheduled",
      description: "The stage's internal ID from your pipeline settings.",
      operations: ["create_deal"],
    },
    {
      name: "propertiesJson",
      label: "Additional Properties",
      type: "textarea",
      placeholder: '{\n  "company": "Acme",\n  "lifecyclestage": "lead"\n}',
      description: "A JSON object of HubSpot property names and values.",
      operations: ["create_contact", "update_contact", "create_deal"],
    },
  ],
};

export const HubspotNode = createIntegrationNode(hubspotConfig);

// =========================================================================
// RESEND / SENDGRID
// =========================================================================
const emailFields: IntegrationField[] = [
  {
    name: "from",
    label: "From",
    placeholder: "Shop <orders@yourdomain.com>",
    description: "An address on a domain you verified with the service.",
    required: true,
  },
  {
    name: "to",
    label: "To",
    placeholder: "customer@example.com",
    description: "Separate several addresses with commas.",
    required: true,
  },
  {
    name: "subject",
    label: "Subject",
    placeholder: "Your order is confirmed",
    required: true,
  },
  {
    name: "emailType",
    label: "Email Type",
    type: "select",
    defaultValue: "text",
    options: [
      { value: "text", label: "Text" },
      { value: "html", label: "HTML" },
    ],
  },
  {
    name: "message",
    label: "Message",
    type: "textarea",
    placeholder: "Hi {{webhook.body.name}},\n\nThanks for your order.",
    required: true,
  },
  { name: "cc", label: "CC", placeholder: "team@example.com" },
  { name: "bcc", label: "BCC", placeholder: "archive@example.com" },
  { name: "replyTo", label: "Reply To", placeholder: "support@yourdomain.com" },
  {
      name: "attachments",
      label: "Attachments",
      placeholder: "pdf.file, report.file",
      description:
        "File variables, comma-separated: files made by PDF Generator, Convert to File, Google Drive or an HTTP Request download.",
    },
];

export const resendConfig: IntegrationConfig = {
  label: "Resend",
  description: "Send an email with the Resend API.",
  logo: "/logos/resend.svg",
  credentialType: CredentialType.RESEND,
  credentialLabel: "Resend Credential",
  defaultVariableName: "resend",
  fields: emailFields,
};

export const ResendNode = createIntegrationNode(resendConfig, (data) =>
  data.to ? `To: ${data.to}` : undefined
);

export const sendgridConfig: IntegrationConfig = {
  label: "SendGrid",
  description: "Send an email with the SendGrid API.",
  logo: "/logos/sendgrid.svg",
  credentialType: CredentialType.SENDGRID,
  credentialLabel: "SendGrid Credential",
  defaultVariableName: "sendgrid",
  fields: emailFields,
};

export const SendgridNode = createIntegrationNode(sendgridConfig, (data) =>
  data.to ? `To: ${data.to}` : undefined
);

// =========================================================================
// MYSQL
// =========================================================================
export const mysqlConfig: IntegrationConfig = {
  label: "MySQL",
  description: "Run queries against a MySQL or MariaDB database.",
  logo: "/logos/mysql.svg",
  credentialType: CredentialType.MYSQL,
  credentialLabel: "MySQL Credential",
  defaultVariableName: "mysql",
  operations: [
    { value: "execute_query", label: "Execute Query" },
    { value: "select_rows", label: "Select Rows" },
    { value: "insert_row", label: "Insert Row" },
  ],
  hint: "Rows are at {{json <name>.rows}}. Connect a Split Out node with Input List <name>.rows to run the next nodes once per row.",
  fields: [
    {
      name: "query",
      label: "Query",
      type: "textarea",
      placeholder: "SELECT * FROM orders WHERE email = ? LIMIT 10",
      description:
        "Use ? for values and list them in Query Parameters, so they are never pasted into the SQL.",
      required: true,
      operations: ["execute_query"],
      warning: (value) =>
        hasQueryExpressions(value) ? QUERY_EXPRESSION_WARNING : undefined,
    },
    {
      name: "paramsJson",
      label: "Query Parameters",
      type: "textarea",
      placeholder: '["{{webhook.body.email}}"]',
      description:
        'A JSON array with one value per ? placeholder. Expressions are safe here: ["{{webhook.body.email}}", {{webhook.body.id}}].',
      operations: ["execute_query"],
    },
    {
      name: "allowQueryExpressions",
      label: ALLOW_QUERY_EXPRESSIONS_LABEL,
      type: "switch",
      defaultValue: "false",
      description:
        "Off: a query with {{ }} expressions in its text is refused when the workflow runs. Turn it on only when the values can never come from outside, such as a table name you set yourself.",
      operations: ["execute_query"],
    },
    {
      name: "table",
      label: "Table",
      placeholder: "orders",
      description: "Table name; use database.table for another database.",
      required: true,
      operations: ["select_rows", "insert_row"],
    },
    {
      name: "limit",
      label: "Limit",
      placeholder: "50",
      description: "How many rows to return (up to 500).",
      operations: ["select_rows"],
    },
    {
      name: "rowJson",
      label: "Row JSON",
      type: "textarea",
      placeholder: '{\n  "email": "{{webhook.body.email}}",\n  "total": 100\n}',
      description: "A JSON object of column names and values.",
      required: true,
      operations: ["insert_row"],
    },
  ],
};

export const MysqlNode = createIntegrationNode(mysqlConfig, (data) => {
  if (data.operation === "execute_query" || !data.operation) {
    return data.query ? `${data.query.slice(0, 40)}...` : undefined;
  }

  return data.table
    ? `${operationLabel(mysqlConfig, data.operation)}: ${data.table}`
    : undefined;
});

// =========================================================================
// TYPEFORM TRIGGER
// =========================================================================
export const typeformTriggerConfig: IntegrationConfig = {
  label: "Typeform Trigger",
  description:
    "Starts when someone submits your typeform. In Typeform open Connect > Webhooks, add the Webhook URL below, set the same Secret there and switch the webhook on. The workflow has to be active.",
  logo: "/logos/typeform.svg",
  trigger: true,
  webhookPath: "typeform",
  summary: "On form submission",
  hint: "Available variables: {{typeform.answers.<question title>}} (also by field ref), {{json typeform.answers}}, {{typeform.formId}}, {{typeform.responseId}}, {{typeform.submittedAt}} and {{json typeform.hidden}} for hidden fields.",
  fields: [
    {
      name: "secret",
      label: "Secret",
      placeholder: "any-long-random-text",
      description:
        "Type the same text into the webhook's Secret field in Typeform. Submissions that are not signed with it are rejected.",
      required: true,
    },
  ],
};

export const TypeformTriggerNode = createIntegrationNode(
  typeformTriggerConfig,
  (data) => (data.secret ? "On form submission" : "Not Configured")
);

// =========================================================================
// RSS
// =========================================================================
const RSS_ITEM_FIELDS =
  "title, link, pubDate, author, snippet, content, categories and id";

export const rssReadConfig: IntegrationConfig = {
  label: "RSS Read",
  description:
    "Reads the items of an RSS or Atom feed. The nodes connected after it run once for every item.",
  logo: Rss,
  defaultVariableName: "feed",
  hint: `Each item has ${RSS_ITEM_FIELDS}: use {{item.title}} or {{ $json.link }} in the next nodes. The whole list is at {{json <name>.items}}, and the feed's name at {{<name>.title}}.`,
  fields: [
    {
      name: "url",
      label: "Feed URL",
      placeholder: "https://example.com/feed.xml",
      description: "The address of the feed itself, not of the website.",
      required: true,
    },
    {
      name: "limit",
      label: "Limit",
      placeholder: "20",
      description: "How many of the newest items to read (up to 100).",
    },
  ],
};

export const RssReadNode = createIntegrationNode(rssReadConfig, (data) => {
  if (!data.url) return "Not Configured";

  try {
    return new URL(data.url).host;
  } catch {
    return data.url;
  }
});

export const rssFeedTriggerConfig: IntegrationConfig = {
  label: "RSS Feed Trigger",
  description:
    "Starts when a new item appears in an RSS or Atom feed. The feed is checked on a schedule while the workflow is active; items that were already in it when you activated the workflow do not start runs.",
  logo: Rss,
  trigger: true,
  summary: "On new feed item",
  hint: `Available variables: {{rss.title}}, {{rss.link}}, {{rss.pubDate}}, {{rss.author}}, {{rss.snippet}}, {{rss.content}}, {{json rss.categories}}, {{rss.id}} and {{rss.feedTitle}}. Each new item starts its own run.`,
  fields: [
    {
      name: "url",
      label: "Feed URL",
      placeholder: "https://example.com/feed.xml",
      description: "The address of the feed itself, not of the website.",
      required: true,
    },
    {
      name: "pollMinutes",
      label: "Check Every",
      type: "select",
      defaultValue: "5",
      required: true,
      options: [
        { value: "1", label: "Minute" },
        { value: "5", label: "5 minutes" },
        { value: "15", label: "15 minutes" },
        { value: "60", label: "Hour" },
        { value: "1440", label: "Day" },
      ],
    },
  ],
};

export const RssFeedTriggerNode = createIntegrationNode(
  rssFeedTriggerConfig,
  (data) => {
    if (!data.url) return "Not Configured";

    try {
      return new URL(data.url).host;
    } catch {
      return data.url;
    }
  }
);

// =========================================================================
// SALESFORCE
// =========================================================================
export const salesforceConfig: IntegrationConfig = {
  label: "Salesforce",
  description:
    "Query, create, read, update and delete records of any Salesforce object: leads, contacts, accounts, opportunities or your own.",
  logo: "/logos/salesforce.svg",
  credentialType: CredentialType.SALESFORCE,
  credentialLabel: "Salesforce Account",
  defaultVariableName: "salesforce",
  operations: [
    { value: "query", label: "Query Records (SOQL)" },
    { value: "create_record", label: "Create Record" },
    { value: "get_record", label: "Get Record" },
    { value: "update_record", label: "Update Record" },
    { value: "delete_record", label: "Delete Record" },
  ],
  hint: "Query results are at {{json <name>.records}}; connect a Split Out node with Input List <name>.records to run the next nodes once per record. Create returns the new record's ID at {{<name>.id}}.",
  fields: [
    {
      name: "query",
      label: "Query",
      type: "textarea",
      placeholder:
        "SELECT Id, Name, Email FROM Lead WHERE Email = '{{webhook.body.email}}' LIMIT 10",
      description: "Written in SOQL, Salesforce's query language.",
      required: true,
      operations: ["query"],
    },
    {
      name: "object",
      label: "Object",
      placeholder: "Lead",
      description:
        "The object's API name: Lead, Contact, Account, Opportunity, or a custom one ending in __c.",
      required: true,
      operations: ["create_record", "get_record", "update_record", "delete_record"],
    },
    {
      name: "recordId",
      label: "Record ID",
      placeholder: "00Q5g00000ABCdeEAH",
      required: true,
      operations: ["get_record", "update_record", "delete_record"],
    },
    {
      name: "fieldsJson",
      label: "Fields",
      type: "textarea",
      placeholder:
        '{\n  "LastName": "{{webhook.body.name}}",\n  "Company": "{{webhook.body.company}}",\n  "Email": "{{webhook.body.email}}"\n}',
      description: "A JSON object of field API names and values.",
      required: true,
      operations: ["create_record", "update_record"],
    },
  ],
};

export const SalesforceNode = createIntegrationNode(salesforceConfig, (data) =>
  data.operation === "query" || !data.operation
    ? data.query
      ? `${data.query.slice(0, 40)}...`
      : undefined
    : data.object
      ? `${operationLabel(salesforceConfig, data.operation)}: ${data.object}`
      : undefined
);

// =========================================================================
// SSH
// =========================================================================
export const sshConfig: IntegrationConfig = {
  label: "SSH",
  description:
    "Runs a command on your own server over SSH: restart a service, pull a deploy, run a backup. The server and login are saved in the credential.",
  logo: "/logos/ssh.svg",
  credentialType: CredentialType.SSH,
  credentialLabel: "SSH Credential",
  defaultVariableName: "ssh",
  hint: "The result has {{<name>.stdout}}, {{<name>.stderr}} and the exit code {{<name>.code}} (0 means success). Values that come from outside, such as webhook data, must be quoted: write {{shellQuote webhook.body.name}} instead of {{webhook.body.name}}, or they could be read as extra commands.",
  fields: [
    {
      name: "command",
      label: "Command",
      type: "textarea",
      placeholder: "sudo systemctl restart myapp",
      description: "One command line, as you would type it in a terminal.",
      required: true,
    },
    {
      name: "workingDirectory",
      label: "Working Directory",
      placeholder: "/var/www/myapp",
      description: "Run the command from this folder.",
    },
    {
      name: "timeout",
      label: "Timeout in seconds",
      placeholder: "30",
      description: "How long the command may run (up to 120).",
    },
    {
      name: "failOnError",
      label: "When The Command Fails",
      type: "select",
      defaultValue: "no",
      options: [
        { value: "no", label: "Continue and report the exit code" },
        { value: "yes", label: "Fail this node" },
      ],
    },
  ],
};

export const SshNode = createIntegrationNode(sshConfig, (data) =>
  data.command ? data.command.split(/\r?\n/)[0].slice(0, 40) : undefined
);
