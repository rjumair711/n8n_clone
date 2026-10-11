"use client";

import { CredentialType } from "@prisma/client";
import { AudioLines, PencilRuler, Rss, Volume2 } from "lucide-react";
import {
  AUDIO_PROVIDERS,
  DEFAULT_VOICE,
  SPEECH_FORMATS,
} from "../../lib/audio-options";
import {
  SHOPIFY_EVENTS,
  WOOCOMMERCE_EVENTS,
  eventLabel,
} from "../../lib/store-options";
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
// WEB SEARCH / READ WEB PAGE
// =========================================================================
const SEARCH_CREDENTIALS: Record<string, CredentialType> = {
  tavily: CredentialType.TAVILY,
  brave: CredentialType.BRAVE_SEARCH,
};

export const webSearchConfig: IntegrationConfig = {
  label: "Web Search",
  description:
    "Searches the web and returns titles, links and snippets. Works as a step and as an AI Agent tool.",
  logo: "/logos/web-search.svg",
  // The search provider. SearXNG is your own server and needs no credential.
  credentialTypeFor: (values) => SEARCH_CREDENTIALS[values.operation ?? "tavily"],
  credentialLabel: "API Key Credential",
  defaultVariableName: "search",
  operations: [
    { value: "tavily", label: "Tavily" },
    { value: "brave", label: "Brave Search" },
    { value: "searxng", label: "SearXNG (self-hosted)" },
  ],
  hint: 'Operation is the search provider. Results are at {{json <name>.results}}, each with title, url and snippet; connect a Split Out node with Input List <name>.results to handle them one by one. As an AI Agent tool, set Query to {{$fromAI "query" "What to search for"}}.',
  fields: [
    {
      name: "query",
      label: "Query",
      placeholder: "{{chatInput}}",
      required: true,
    },
    {
      name: "searxngUrl",
      label: "SearXNG URL",
      placeholder: "https://search.example.com",
      description:
        'The address of your SearXNG server. Its JSON output has to be on ("json" under search.formats in settings.yml). A server on a private network also has to be listed in PRIVATE_NETWORK_ALLOWLIST.',
      required: true,
      operations: ["searxng"],
    },
    {
      name: "maxResults",
      label: "Max Results",
      placeholder: "5",
      defaultValue: "5",
      description: "How many results to return, up to 20.",
    },
    {
      name: "maxCharacters",
      label: "Max Characters Per Result",
      placeholder: "500",
      defaultValue: "500",
      description:
        "Each result's snippet is cut to this length (50 to 5000). Less text costs fewer tokens when a model reads the results.",
    },
  ],
};

export const WebSearchNode = createIntegrationNode(webSearchConfig, (data) =>
  data.query ? `Search: ${data.query}` : undefined
);

const READER_CREDENTIALS: Record<string, CredentialType> = {
  jina: CredentialType.JINA_READER,
  firecrawl: CredentialType.FIRECRAWL,
};

export const readWebPageConfig: IntegrationConfig = {
  label: "Read Web Page",
  description:
    "Fetches a web page and returns its main content as clean Markdown or text, without menus, ads and scripts. Works as a step and as an AI Agent tool. Private and local addresses are blocked.",
  logo: "/logos/web-page.svg",
  credentialTypeFor: (values) => READER_CREDENTIALS[values.operation ?? "builtin"],
  credentialLabel: "API Key Credential",
  defaultVariableName: "page",
  operations: [
    { value: "builtin", label: "Built-in reader" },
    { value: "jina", label: "Jina Reader" },
    { value: "firecrawl", label: "Firecrawl" },
  ],
  hint: 'Operation is how the page is read. The built-in reader needs no account and reads the page\'s HTML; choose Jina Reader or Firecrawl for pages that build their content with JavaScript. The text is at {{<name>.content}}, with {{<name>.title}}, {{<name>.url}} and {{<name>.truncated}}. As an AI Agent tool, set URL to {{$fromAI "url" "The address of the page to read"}}.',
  fields: [
    {
      name: "url",
      label: "URL",
      placeholder: "https://example.com/article",
      required: true,
    },
    {
      name: "format",
      label: "Output",
      type: "select",
      defaultValue: "markdown",
      options: [
        { value: "markdown", label: "Markdown (headings, lists, links)" },
        { value: "text", label: "Plain text" },
      ],
    },
    {
      name: "maxCharacters",
      label: "Max Characters",
      placeholder: "8000",
      defaultValue: "8000",
      description:
        "The text is cut to this length (100 to 100000) and marked as cut. A page can be very long; less text costs fewer tokens when a model reads it.",
    },
  ],
};

export const ReadWebPageNode = createIntegrationNode(readWebPageConfig, (data) =>
  data.url ? data.url : undefined
);

// =========================================================================
// TRANSCRIBE AUDIO / TEXT TO SPEECH
// =========================================================================
// OpenAI uses its own credential; Groq and other OpenAI-compatible servers
// use the Chat Model API key credential
const audioCredential = (values: { operation?: string }) =>
  (values.operation ?? "openai") === "openai"
    ? CredentialType.OPENAI
    : CredentialType.OPENAI_COMPATIBLE;

const audioProviderOperations = AUDIO_PROVIDERS.map(({ value, label }) => ({ value, label }));

const audioBaseUrlField: IntegrationField = {
  name: "baseUrl",
  label: "Base URL",
  placeholder: "https://api.example.com/v1",
  description:
    "The address of an OpenAI-compatible API, without /audio/... at the end. A server on a private network also has to be listed in PRIVATE_NETWORK_ALLOWLIST.",
  required: true,
  operations: ["custom"],
};

export const transcribeAudioConfig: IntegrationConfig = {
  label: "Transcribe Audio",
  description:
    "Turns speech in an audio file into text with OpenAI Whisper, Groq Whisper, or any OpenAI-compatible /audio/transcriptions endpoint.",
  logo: AudioLines,
  credentialTypeFor: audioCredential,
  credentialLabel: "API Key Credential",
  defaultVariableName: "transcript",
  operations: audioProviderOperations,
  hint: "Operation is the provider. The text is at {{<name>.text}}. For a voice bot: Telegram Trigger or WhatsApp Trigger, then this node with File telegram.voice or whatsapp.voice, then an AI Agent whose prompt is {{<name>.text}}. OpenAI uses an OpenAI credential; Groq and other servers use a Chat Model API Key credential.",
  fields: [
    {
      name: "file",
      label: "File",
      placeholder: "telegram.voice",
      description:
        "A file variable holding audio: a voice message from the Telegram or WhatsApp trigger, a form upload, an HTTP Request download. MP3, M4A, WAV, OGG, WebM, FLAC or MP4. Leave empty inside a list of files.",
    },
    audioBaseUrlField,
    {
      name: "model",
      label: "Model",
      placeholder: "whisper-1",
      description:
        "Empty: whisper-1 on OpenAI, whisper-large-v3-turbo on Groq. Required for a custom base URL.",
    },
    {
      name: "language",
      label: "Language",
      placeholder: "ur",
      description:
        "The language that is spoken, as a code (en, ur, ar...). Optional: it is detected when left empty, and naming it makes the result more accurate.",
    },
    {
      name: "prompt",
      label: "Hint",
      placeholder: "Names: Hunza, RXJ, Umair",
      description: "Optional: names or unusual words to help with their spelling.",
    },
  ],
};

export const TranscribeAudioNode = createIntegrationNode(transcribeAudioConfig, (data) =>
  data.file ? `Transcribe ${data.file}` : undefined
);

export const textToSpeechConfig: IntegrationConfig = {
  label: "Text to Speech",
  description:
    "Turns text into spoken audio with OpenAI TTS or an OpenAI-compatible /audio/speech endpoint. The result is a file you can send with the Telegram, WhatsApp or email nodes.",
  logo: Volume2,
  credentialTypeFor: audioCredential,
  credentialLabel: "API Key Credential",
  defaultVariableName: "speech",
  operations: audioProviderOperations,
  hint: "Operation is the provider. The audio is a file at {{<name>.file}}: use <name>.file in a Telegram or WhatsApp node's File field, or in an email's Attachments. It is stored like other workflow files (same size limit, removed after the retention period).",
  fields: [
    {
      name: "text",
      label: "Text",
      type: "textarea",
      placeholder: "{{aiAgentOutput.output}}",
      description: "Up to 4096 characters.",
      required: true,
    },
    audioBaseUrlField,
    {
      name: "model",
      label: "Model",
      placeholder: "tts-1",
      description: "Empty: tts-1 on OpenAI. Required for Groq and a custom base URL.",
    },
    {
      name: "voice",
      label: "Voice",
      placeholder: DEFAULT_VOICE,
      description:
        "A voice of the model. OpenAI has alloy, echo, fable, onyx, nova and shimmer, among others. Empty: alloy.",
    },
    {
      name: "format",
      label: "Format",
      type: "select",
      defaultValue: "mp3",
      options: SPEECH_FORMATS.map(({ value, label }) => ({ value, label })),
    },
    {
      name: "fileName",
      label: "File Name",
      placeholder: "speech",
      description: "Without the extension. Empty: speech.",
    },
  ],
};

export const TextToSpeechNode = createIntegrationNode(textToSpeechConfig, (data) =>
  data.text ? "Speak text" : undefined
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

// =========================================================================
// SHOPIFY / WOOCOMMERCE
// =========================================================================
const STORE_LIST_HINT =
  "A list operation returns its items at {{json <name>.items}} and their number at {{<name>.count}}: add a Split Out node with Input List <name> to run the next nodes once per item. Fields support {{variables}}; when this node is an AI Agent tool, use {{$fromAI \"name\" \"what it is\"}} for values the agent should fill in.";

const storeFieldsField = (operations: string[], placeholder: string): IntegrationField => ({
  name: "fields",
  label: "Fields",
  placeholder,
  description:
    "Comma-separated. Only these fields are returned, which keeps a long list small.",
  operations,
});

const storeLimitField = (operations: string[]): IntegrationField => ({
  name: "limit",
  label: "Limit",
  placeholder: "20",
  description: "How many to return (up to 100).",
  operations,
});

export const shopifyConfig: IntegrationConfig = {
  label: "Shopify",
  description:
    "Work with the orders, products, customers and inventory of a Shopify store, and list its abandoned checkouts.",
  logo: "/logos/shopify.svg",
  credentialType: CredentialType.SHOPIFY,
  credentialLabel: "Shopify Credential",
  defaultVariableName: "shopify",
  hint: STORE_LIST_HINT,
  operations: [
    { value: "get_order", label: "Get Order" },
    { value: "list_orders", label: "List Orders" },
    { value: "update_order", label: "Update Order" },
    { value: "get_product", label: "Get Product" },
    { value: "list_products", label: "List Products" },
    { value: "create_product", label: "Create Product" },
    { value: "update_product", label: "Update Product" },
    { value: "get_customer", label: "Get Customer" },
    { value: "search_customers", label: "Search Customers" },
    { value: "create_customer", label: "Create Customer" },
    { value: "update_customer", label: "Update Customer" },
    { value: "get_inventory", label: "Get Inventory Level" },
    { value: "set_inventory", label: "Set Inventory Level" },
    { value: "adjust_inventory", label: "Adjust Inventory Level" },
    { value: "list_locations", label: "List Locations" },
    { value: "list_abandoned_checkouts", label: "List Abandoned Checkouts" },
  ],
  fields: [
    {
      name: "shopDomain",
      label: "Shop Domain",
      placeholder: "my-store.myshopify.com",
      description:
        "The store's myshopify.com address, not its public domain. The credential's token is only sent there.",
      required: true,
    },
    {
      name: "orderId",
      label: "Order ID",
      placeholder: "{{shopify.order.id}}",
      description: "The long number in the order's address in Shopify admin, not #1001.",
      required: true,
      operations: ["get_order", "update_order"],
    },
    {
      name: "status",
      label: "Status",
      type: "select",
      defaultValue: "any",
      options: [
        { value: "any", label: "Any" },
        { value: "open", label: "Open" },
        { value: "closed", label: "Closed" },
        { value: "cancelled", label: "Cancelled" },
      ],
      operations: ["list_orders"],
    },
    {
      name: "financialStatus",
      label: "Payment Status",
      placeholder: "paid",
      description: "paid, pending, authorized, partially_paid, refunded, voided or unpaid.",
      operations: ["list_orders"],
    },
    {
      name: "fulfillmentStatus",
      label: "Fulfillment Status",
      placeholder: "unfulfilled",
      description: "unfulfilled, shipped, partial or unshipped.",
      operations: ["list_orders"],
    },
    {
      name: "createdAfter",
      label: "Created After",
      placeholder: "2026-01-31",
      description: "Only orders created after this date.",
      operations: ["list_orders"],
    },
    {
      name: "note",
      label: "Note",
      type: "textarea",
      placeholder: "Confirmation sent on WhatsApp",
      operations: ["update_order"],
    },
    {
      name: "productId",
      label: "Product ID",
      placeholder: "{{shopify.product.id}}",
      required: true,
      operations: ["get_product", "update_product"],
    },
    {
      name: "title",
      label: "Title",
      placeholder: "Cotton T-shirt",
      required: true,
      operations: ["create_product"],
    },
    {
      name: "title",
      label: "Title",
      placeholder: "Cotton T-shirt",
      operations: ["list_products", "update_product"],
    },
    {
      name: "description",
      label: "Description",
      type: "textarea",
      placeholder: "<p>Soft cotton, regular fit.</p>",
      description: "Text or HTML.",
      operations: ["create_product", "update_product"],
    },
    {
      name: "price",
      label: "Price",
      placeholder: "19.99",
      operations: ["create_product"],
    },
    {
      name: "sku",
      label: "SKU",
      placeholder: "TSHIRT-M-BLUE",
      operations: ["create_product"],
    },
    {
      name: "vendor",
      label: "Vendor",
      placeholder: "Acme",
      operations: ["create_product", "update_product"],
    },
    {
      name: "productType",
      label: "Product Type",
      placeholder: "Shirts",
      operations: ["create_product", "update_product"],
    },
    {
      name: "productStatus",
      label: "Product Status",
      placeholder: "active",
      description: "active, draft or archived.",
      operations: ["list_products", "create_product", "update_product"],
    },
    {
      name: "customerId",
      label: "Customer ID",
      placeholder: "{{shopify.order.customer.id}}",
      required: true,
      operations: ["get_customer", "update_customer"],
    },
    {
      name: "query",
      label: "Search",
      placeholder: "email:ali@example.com",
      description:
        "Shopify's customer search: a name, or a field such as email:, phone: or country:.",
      required: true,
      operations: ["search_customers"],
    },
    {
      name: "email",
      label: "Email",
      placeholder: "customer@example.com",
      operations: ["update_order", "create_customer", "update_customer"],
    },
    {
      name: "phone",
      label: "Phone",
      placeholder: "+923001234567",
      description: "With country code. Shopify refuses a number another customer has.",
      operations: ["create_customer", "update_customer"],
    },
    {
      name: "firstName",
      label: "First Name",
      placeholder: "Ali",
      operations: ["create_customer", "update_customer"],
    },
    {
      name: "lastName",
      label: "Last Name",
      placeholder: "Khan",
      operations: ["create_customer", "update_customer"],
    },
    {
      name: "tags",
      label: "Tags",
      placeholder: "vip, whatsapp-confirmed",
      description: "Comma-separated. On an update they replace the existing tags.",
      operations: [
        "update_order",
        "create_product",
        "update_product",
        "create_customer",
        "update_customer",
      ],
    },
    {
      name: "inventoryItemId",
      label: "Inventory Item ID",
      placeholder: "{{shopify.variants.0.inventory_item_id}}",
      description:
        "A variant's inventory_item_id, from Get Product (variants.0.inventory_item_id). It is not the product or variant ID.",
      required: true,
      operations: ["get_inventory", "set_inventory", "adjust_inventory"],
    },
    {
      name: "locationId",
      label: "Location ID",
      placeholder: "From List Locations",
      required: true,
      operations: ["set_inventory", "adjust_inventory"],
    },
    {
      name: "locationId",
      label: "Location ID",
      placeholder: "From List Locations",
      description: "Leave empty for every location.",
      operations: ["get_inventory"],
    },
    {
      name: "quantity",
      label: "Quantity",
      placeholder: "25",
      description:
        "Set: the new stock. Adjust: how much to add, or a negative number to take away.",
      required: true,
      operations: ["set_inventory", "adjust_inventory"],
    },
    {
      name: "minAgeMinutes",
      label: "Abandoned At Least (minutes ago)",
      placeholder: "60",
      description: "Checkouts that were last touched this long ago or longer. Default 60.",
      operations: ["list_abandoned_checkouts"],
    },
    {
      name: "maxAgeMinutes",
      label: "Abandoned At Most (minutes ago)",
      placeholder: "120",
      description:
        "Leave out older ones. With a schedule that runs every hour, 60 and 120 give each checkout one reminder.",
      operations: ["list_abandoned_checkouts"],
    },
    {
      name: "contactOnly",
      label: "Only With Contact Details",
      type: "switch",
      defaultValue: "true",
      description: "Leave out checkouts that have no email address and no phone number.",
      operations: ["list_abandoned_checkouts"],
    },
    storeLimitField([
      "list_orders",
      "list_products",
      "search_customers",
      "list_abandoned_checkouts",
    ]),
    storeFieldsField(
      [
        "get_order",
        "list_orders",
        "get_product",
        "list_products",
        "get_customer",
        "search_customers",
      ],
      "id, name, email, total_price"
    ),
    {
      name: "fieldsJson",
      label: "Additional Fields",
      type: "textarea",
      placeholder: '{\n  "metafields": [],\n  "note_attributes": [{ "name": "source", "value": "rxj" }]\n}',
      description: "A JSON object in Shopify's field names, merged into what is sent.",
      operations: [
        "update_order",
        "create_product",
        "update_product",
        "create_customer",
        "update_customer",
      ],
    },
    {
      name: "apiVersion",
      label: "API Version",
      placeholder: "2025-01",
      description: "Leave empty unless you need a newer version of the Admin API.",
    },
  ],
};

export const ShopifyNode = createIntegrationNode(shopifyConfig, (data) =>
  data.shopDomain ? operationLabel(shopifyConfig, data.operation) : "Not Configured"
);

export const shopifyTriggerConfig: IntegrationConfig = {
  label: "Shopify Trigger",
  description:
    "Starts when something happens in your Shopify store. In Shopify admin open Settings > Notifications > Webhooks, create a webhook for the event with format JSON and the Webhook URL below, then copy the signing secret shown on that page into this node. The workflow has to be active.",
  logo: "/logos/shopify.svg",
  trigger: true,
  webhookPath: "shopify",
  summary: "On store event",
  hint: "Available variables: {{shopify.event}}, {{shopify.id}}, {{shopify.email}}, {{shopify.phone}}, {{shopify.customerName}} and {{shopify.shopDomain}}. Everything Shopify sent is at {{json shopify.order}} (or shopify.product, shopify.customer, shopify.checkout), for example {{shopify.order.name}} and {{shopify.order.total_price}}.",
  fields: [
    {
      name: "event",
      label: "Event",
      type: "select",
      defaultValue: SHOPIFY_EVENTS[0].value,
      required: true,
      options: SHOPIFY_EVENTS,
      description:
        "Create the webhook in Shopify for the same event. Other events sent to the URL are ignored.",
    },
    {
      name: "signingSecret",
      label: "Signing Secret",
      placeholder: "From Settings > Notifications > Webhooks",
      description:
        "Used to check that each event really comes from your store. Events are rejected without it. For a webhook made by a custom app, it is the app's API secret key.",
      required: true,
    },
  ],
};

export const ShopifyTriggerNode = createIntegrationNode(
  shopifyTriggerConfig,
  (data) =>
    data.signingSecret
      ? eventLabel(SHOPIFY_EVENTS, data.event) ?? "On store event"
      : "Not Configured"
);

export const woocommerceConfig: IntegrationConfig = {
  label: "WooCommerce",
  description:
    "Work with the orders, products and customers of a WooCommerce store through its REST API.",
  logo: "/logos/woocommerce.svg",
  credentialType: CredentialType.WOOCOMMERCE,
  credentialLabel: "WooCommerce Credential",
  defaultVariableName: "woocommerce",
  hint: STORE_LIST_HINT,
  operations: [
    { value: "get_order", label: "Get Order" },
    { value: "list_orders", label: "List Orders" },
    { value: "update_order", label: "Update Order" },
    { value: "add_order_note", label: "Add Order Note" },
    { value: "get_product", label: "Get Product" },
    { value: "list_products", label: "List Products" },
    { value: "create_product", label: "Create Product" },
    { value: "update_product", label: "Update Product" },
    { value: "get_customer", label: "Get Customer" },
    { value: "list_customers", label: "List Customers" },
    { value: "create_customer", label: "Create Customer" },
    { value: "update_customer", label: "Update Customer" },
  ],
  fields: [
    {
      name: "storeUrl",
      label: "Store URL",
      placeholder: "https://shop.example.com",
      description:
        "The shop's https address. The credential's key and secret are sent there with every request.",
      required: true,
    },
    {
      name: "orderId",
      label: "Order ID",
      placeholder: "{{woocommerce.order.id}}",
      required: true,
      operations: ["get_order", "update_order", "add_order_note"],
    },
    {
      name: "status",
      label: "Status",
      placeholder: "processing",
      description:
        "pending, processing, on-hold, completed, cancelled, refunded or failed.",
      operations: ["list_orders", "update_order"],
    },
    {
      name: "search",
      label: "Search",
      placeholder: "ali@example.com",
      operations: ["list_orders", "list_products", "list_customers"],
    },
    {
      name: "createdAfter",
      label: "Created After",
      placeholder: "2026-01-31",
      description: "Only orders created after this date.",
      operations: ["list_orders"],
    },
    {
      name: "customerNote",
      label: "Customer Note",
      type: "textarea",
      placeholder: "Please leave the parcel with the guard.",
      description: "The note on the order that the customer wrote, or you write for them.",
      operations: ["update_order"],
    },
    {
      name: "note",
      label: "Note",
      type: "textarea",
      placeholder: "Confirmation sent on WhatsApp",
      required: true,
      operations: ["add_order_note"],
    },
    {
      name: "noteForCustomer",
      label: "Send To Customer",
      type: "switch",
      defaultValue: "false",
      description:
        "On: WooCommerce emails the note to the customer. Off: only shop staff see it.",
      operations: ["add_order_note"],
    },
    {
      name: "productId",
      label: "Product ID",
      placeholder: "{{woocommerce.product.id}}",
      required: true,
      operations: ["get_product", "update_product"],
    },
    {
      name: "name",
      label: "Name",
      placeholder: "Cotton T-shirt",
      required: true,
      operations: ["create_product"],
    },
    {
      name: "name",
      label: "Name",
      placeholder: "Cotton T-shirt",
      operations: ["update_product"],
    },
    {
      name: "price",
      label: "Regular Price",
      placeholder: "19.99",
      operations: ["create_product", "update_product"],
    },
    {
      name: "description",
      label: "Description",
      type: "textarea",
      placeholder: "<p>Soft cotton, regular fit.</p>",
      operations: ["create_product", "update_product"],
    },
    {
      name: "sku",
      label: "SKU",
      placeholder: "TSHIRT-M-BLUE",
      operations: ["list_products", "create_product", "update_product"],
    },
    {
      name: "stockQuantity",
      label: "Stock Quantity",
      placeholder: "25",
      description: "Setting it also switches on stock management for the product.",
      operations: ["create_product", "update_product"],
    },
    {
      name: "productStatus",
      label: "Product Status",
      placeholder: "publish",
      description: "publish, draft, pending or private.",
      operations: ["list_products", "create_product", "update_product"],
    },
    {
      name: "customerId",
      label: "Customer ID",
      placeholder: "{{woocommerce.order.customer_id}}",
      required: true,
      operations: ["get_customer", "update_customer"],
    },
    {
      name: "email",
      label: "Email",
      placeholder: "customer@example.com",
      required: true,
      operations: ["create_customer"],
    },
    {
      name: "email",
      label: "Email",
      placeholder: "customer@example.com",
      operations: ["list_customers", "update_customer"],
    },
    {
      name: "firstName",
      label: "First Name",
      placeholder: "Ali",
      operations: ["create_customer", "update_customer"],
    },
    {
      name: "lastName",
      label: "Last Name",
      placeholder: "Khan",
      operations: ["create_customer", "update_customer"],
    },
    storeLimitField(["list_orders", "list_products", "list_customers"]),
    storeFieldsField(
      [
        "get_order",
        "list_orders",
        "get_product",
        "list_products",
        "get_customer",
        "list_customers",
      ],
      "id, status, total, billing"
    ),
    {
      name: "fieldsJson",
      label: "Additional Fields",
      type: "textarea",
      placeholder: '{\n  "billing": { "phone": "+923001234567" },\n  "meta_data": [{ "key": "source", "value": "rxj" }]\n}',
      description: "A JSON object in WooCommerce's field names, merged into what is sent.",
      operations: [
        "update_order",
        "create_product",
        "update_product",
        "create_customer",
        "update_customer",
      ],
    },
  ],
};

export const WoocommerceNode = createIntegrationNode(woocommerceConfig, (data) =>
  data.storeUrl ? operationLabel(woocommerceConfig, data.operation) : "Not Configured"
);

export const woocommerceTriggerConfig: IntegrationConfig = {
  label: "WooCommerce Trigger",
  description:
    "Starts when something happens in your WooCommerce store. Activate the workflow first, then in WordPress open WooCommerce > Settings > Advanced > Webhooks, add a webhook with status Active, the topic for the event, the Webhook URL below as Delivery URL, and the same Secret as here.",
  logo: "/logos/woocommerce.svg",
  trigger: true,
  webhookPath: "woocommerce",
  summary: "On store event",
  hint: "Available variables: {{woocommerce.event}}, {{woocommerce.id}}, {{woocommerce.email}}, {{woocommerce.phone}}, {{woocommerce.customerName}} and {{woocommerce.storeUrl}}. Everything WooCommerce sent is at {{json woocommerce.order}} (or woocommerce.product, woocommerce.customer), for example {{woocommerce.order.number}} and {{woocommerce.order.total}}.",
  fields: [
    {
      name: "event",
      label: "Event",
      type: "select",
      defaultValue: WOOCOMMERCE_EVENTS[0].value,
      required: true,
      options: WOOCOMMERCE_EVENTS,
      description:
        "Order paid: give the WooCommerce webhook the topic Order updated. The run starts once per order, when it first has a payment date.",
    },
    {
      name: "orderStatus",
      label: "Only When The Order Status Is",
      placeholder: "processing",
      description:
        "For order events: pending, processing, on-hold, completed, cancelled, refunded or failed. An order starts one run per status.",
    },
    {
      name: "secret",
      label: "Secret",
      placeholder: "any-long-random-text",
      description:
        "Type the same text into the webhook's Secret field in WooCommerce. Events that are not signed with it are rejected.",
      required: true,
    },
  ],
};

export const WoocommerceTriggerNode = createIntegrationNode(
  woocommerceTriggerConfig,
  (data) =>
    data.secret
      ? eventLabel(WOOCOMMERCE_EVENTS, data.event) ?? "On store event"
      : "Not Configured"
);
