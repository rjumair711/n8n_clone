// "Build with AI": the settings of the nodes whose dialog is written by
// hand. Nodes made with createIntegrationNode describe themselves (their
// config is read by catalogue.ts); these do not, so what the model needs to
// know about them is written down here. A test checks that every node type
// in the registry is covered by one or the other.
//
// When a field of one of these dialogs changes, change it here too.

import { CONDITION_OPERATORS } from "@/features/executions/lib/conditions";
import {
  MAIN_INPUT,
  SUB_PORT_ACCEPTS,
  type CatalogueField,
  type ManualSpec,
} from "./catalogue";

const OPERATORS = CONDITION_OPERATORS.map((operator) => operator.value);

const variableName = (fallback: string): CatalogueField => ({
  name: "variableName",
  type: "text",
  required: true,
  default: fallback,
  description:
    "Letters, numbers and underscores. Later nodes read the result at {{<variableName>...}}; give every node its own.",
});

const condition = (): CatalogueField[] => [
  {
    name: "inputKey",
    type: "text",
    required: true,
    description: "Path of the value to test, without braces.",
    example: "webhook.body.amount",
  },
  { name: "operator", type: "select", required: true, options: OPERATORS },
  {
    name: "value",
    type: "text",
    description:
      "What to compare with. Not used by exists / not_exists. May contain {{variables}}.",
  },
];

const CONDITION_SHAPE = `{"inputKey":"webhook.body.amount","operator":"greater_than","value":"100"} (operator: ${OPERATORS.join(", ")})`;

const modelNode = (
  credential: string,
  defaultModel: string,
  fallbackName: string
): ManualSpec => ({
  credential,
  variableName: fallbackName,
  fields: [
    variableName(fallbackName),
    { name: "model", type: "text", description: `Model ID. Empty: ${defaultModel}.` },
    { name: "systemPrompt", type: "textarea" },
    {
      name: "userPrompt",
      type: "textarea",
      description:
        "The question. Needed when the node runs on its own, not when it is only plugged into a Model port.",
      example: "Summarise this: {{webhook.body.text}}",
    },
  ],
  notes:
    "On its own it answers userPrompt; the answer is at {{<variableName>.text}}. Plugged into a Model port (sub-model) it only says which model that node uses: set just variableName then.",
});

export const MANUAL_SPECS: Record<string, ManualSpec> = {
  // ------------------------------------------------------------- triggers
  MANUAL_TRIGGER: {
    trigger: true,
    fields: [],
    notes: "At most one per workflow. Use it when nothing else should start the run.",
  },
  SCHEDULE_TRIGGER: {
    trigger: true,
    variableName: "scheduleTrigger",
    fields: [
      variableName("scheduleTrigger"),
      {
        name: "cronExpression",
        type: "text",
        required: true,
        default: "0 * * * *",
        description: "A five-part cron expression, checked every minute.",
        example: "0 9 * * 1-5",
      },
    ],
    notes: "{{<variableName>.timestamp}} is the time of the run.",
  },
  WEBHOOK_TRIGGER: {
    trigger: true,
    userConfigured: ["Secret (made when the node's settings are opened)"],
    fields: [
      {
        name: "responseMode",
        type: "select",
        options: ["immediately", "lastNode", "responseNode"],
        default: "immediately",
        description:
          "What the caller gets back: at once, the data of the last node, or what a RESPOND_TO_WEBHOOK node sends.",
      },
    ],
    notes:
      "The request is at {{webhook.body.<field>}}, {{webhook.query.<name>}} and {{webhook.headers.<name>}}.",
  },
  CHAT_TRIGGER: {
    trigger: true,
    fields: [
      {
        name: "chatPublic",
        type: "boolean",
        default: false,
        description: "true gives the chat a public page and a website widget.",
      },
      { name: "chatTitle", type: "text" },
      { name: "chatWelcome", type: "text", description: "First message shown to a visitor." },
    ],
    notes:
      "The message is at {{chatInput}} and the conversation at {{sessionId}}. Connect it to an AI_AGENT, whose answer the chat shows.",
  },
  GOOGLE_FORM_TRIGGER: {
    trigger: true,
    userConfigured: ["The Apps Script that calls the webhook URL shown in the node"],
    fields: [],
    notes:
      "Answers are at {{googleForm.responses.[Question title]}}; {{googleForm.respondentEmail}} when the form collects it.",
  },
  STRIPE_TRIGGER: {
    trigger: true,
    userConfigured: ["The Stripe webhook that calls the URL shown in the node"],
    fields: [],
    notes: "The event is at {{stripe.eventType}} and {{stripe.raw...}}.",
  },

  // ---------------------------------------------------------- flow control
  FILTER: {
    fields: condition(),
    notes: "The nodes after it only run when the condition is true.",
  },
  IF: {
    fields: [
      {
        name: "conditions",
        type: "list",
        required: true,
        description: `A JSON array with at least one condition: ${CONDITION_SHAPE}.`,
      },
      { name: "combinator", type: "select", options: ["and", "or"], default: "and" },
    ],
    outputs: [
      { id: "true", label: "True" },
      { id: "false", label: "False" },
    ],
  },
  SWITCH: {
    fields: [
      {
        name: "rules",
        type: "list",
        required: true,
        description:
          'A JSON array of rules, tried in order: {"id":"rule-vip","label":"VIP","inputKey":"webhook.body.plan","operator":"equals","value":"vip"}. Every rule needs its own id.',
      },
      {
        name: "fallbackBranch",
        type: "boolean",
        default: true,
        description: 'true adds the "default" output, taken when no rule matches.',
      },
    ],
    outputs: [{ id: "default", label: "Default" }],
    dynamicOutputs:
      'One output per rule, whose id is the rule\'s id, plus "default" unless fallbackBranch is false.',
  },
  MERGE: {
    variableName: "merge",
    fields: [
      {
        name: "mode",
        type: "select",
        options: ["any", "all"],
        default: "any",
        description:
          '"any" after an IF or Switch, where one branch runs; "all" waits for every connected branch.',
      },
      {
        name: "combine",
        type: "select",
        options: ["none", "append", "byKey", "byPosition"],
        default: "none",
        description: "Optionally join two lists into one, at {{<variableName>.items}}.",
      },
      { name: "listA", type: "text", description: "Path of the first list, when combining." },
      { name: "listB", type: "text", description: "Path of the second list, when combining." },
      { name: "keyA", type: "text", description: "byKey: the field to match on in list A." },
      { name: "keyB", type: "text", description: "byKey: the field in list B; empty when it has the same name." },
      variableName("merge"),
    ],
    notes: "Several nodes may connect to its one input.",
  },
  LOOP: {
    variableName: "loop",
    fields: [
      {
        name: "itemsPath",
        type: "text",
        required: true,
        description: "Path of the list to go through, without braces.",
        example: "myApiCall.httpResponse.data.items",
      },
      variableName("loop"),
      { name: "maxIterations", type: "number", default: 100, description: "1 to 200." },
    ],
    outputs: [
      { id: "loop", label: "Each item" },
      { id: "done", label: "Done" },
    ],
    notes:
      'Nodes connected to "loop" run once per item, with {{<variableName>.item}} and {{<variableName>.index}}; nodes connected to "done" run once afterwards. Do not connect the end of the loop back to the Loop node: it goes on to the next item by itself.',
  },
  DELAY: {
    fields: [
      { name: "delayAmount", type: "number", required: true, default: 1 },
      {
        name: "delayUnit",
        type: "select",
        required: true,
        options: ["seconds", "minutes", "hours"],
        default: "seconds",
      },
    ],
  },

  // ------------------------------------------------------------------ data
  SET_VARIABLE: {
    fields: [
      {
        name: "variableName",
        type: "text",
        required: true,
        description: "The name later nodes read the value by: {{<variableName>}}.",
      },
      { name: "variableValue", type: "text", required: true, description: "May contain {{variables}}." },
    ],
  },
  CODE: {
    variableName: "codeResult",
    fields: [
      {
        name: "code",
        type: "textarea",
        required: true,
        description:
          "The body of a JavaScript function. The workflow's variables are in `context` (context.webhook.body ...). It must return an object or a list. No network, no imports.",
        example: "const total = context.order.items.reduce((sum, item) => sum + item.price, 0);\nreturn { total };",
      },
      variableName("codeResult"),
      { name: "timeoutSeconds", type: "number", default: 10, description: "1 to 60." },
    ],
    notes: "What the code returns is at {{<variableName>...}}.",
  },
  CALCULATOR: {
    variableName: "calculatorResult",
    fields: [
      variableName("calculatorResult"),
      {
        name: "operation",
        type: "select",
        required: true,
        options: ["add", "subtract", "multiply", "divide", "round", "floor", "ceil"],
      },
      { name: "inputA", type: "text", required: true, description: "A number or a {{variable}}." },
      { name: "inputB", type: "text", description: "Not used by round, floor and ceil." },
    ],
    notes: "The result is at {{<variableName>.result}}.",
  },
  DATE_TIME: {
    variableName: "myDate",
    fields: [
      variableName("myDate"),
      {
        name: "operation",
        type: "select",
        required: true,
        options: ["current", "format", "manipulate", "compare"],
      },
      { name: "timezone", type: "text", required: true, default: "UTC", example: "Asia/Karachi" },
      { name: "inputDate", type: "text", description: "The date to work on; not used by current." },
      { name: "formatString", type: "text", description: "A dayjs format.", example: "YYYY-MM-DD HH:mm" },
      { name: "action", type: "select", options: ["add", "subtract"], description: "For manipulate." },
      { name: "amount", type: "number", description: "For manipulate." },
      {
        name: "unit",
        type: "select",
        options: ["seconds", "minutes", "hours", "days", "weeks", "months", "years"],
        description: "For manipulate.",
      },
      { name: "compareDate", type: "text", description: "For compare." },
    ],
    notes:
      "current, format and manipulate give {{<variableName>.result}} and {{<variableName>.iso}}; compare gives {{<variableName>.difference}}, .isBefore and .isAfter.",
  },
  TEXT_FORMATTER: {
    variableName: "formattedText",
    fields: [
      variableName("formattedText"),
      {
        name: "operation",
        type: "select",
        required: true,
        options: ["uppercase", "lowercase", "trim", "replace", "extract"],
      },
      { name: "inputText", type: "text", required: true },
      { name: "searchString", type: "text", description: "For replace." },
      { name: "replaceString", type: "text", description: "For replace." },
      { name: "regexPattern", type: "text", description: "For extract." },
    ],
    notes: "The result is at {{<variableName>.result}}.",
  },

  // ------------------------------------------------------------------- AI
  OPENAI: modelNode("OPENAI", "gpt-4o-mini", "openai"),
  ANTHROPIC: modelNode("ANTHROPIC", "claude-sonnet-5-5", "anthropic"),
  GEMINI: modelNode("GEMINI", "gemini-2.5-flash", "gemini"),
  AI_AGENT: {
    variableName: "aiAgentOutput",
    fields: [
      {
        name: "promptType",
        type: "select",
        options: ["auto", "define"],
        default: "auto",
        description:
          '"auto" takes the message of a Chat Trigger ({{chatInput}}); "define" uses the text field. Use "define" with every other trigger.',
      },
      {
        name: "text",
        type: "textarea",
        description: "The task, for promptType define.",
        example: "Answer this customer: {{webhook.body.message}}",
      },
      { name: "systemMessage", type: "textarea", default: "You are a helpful assistant" },
      { name: "maxIterations", type: "number", default: 10, description: "1 to 50." },
      variableName("aiAgentOutput"),
    ],
    inputs: [
      { id: "flow-in", label: "Main" },
      { id: "sub-model", label: "Chat Model", accepts: SUB_PORT_ACCEPTS["sub-model"] },
      { id: "sub-parser", label: "Output Parser", accepts: SUB_PORT_ACCEPTS["sub-parser"] },
      { id: "sub-memory", label: "Memory", accepts: SUB_PORT_ACCEPTS["sub-memory"] },
      { id: "sub-tools", label: "Tools" },
    ],
    outputs: [{ id: "flow-out", label: "Main" }],
    notes:
      'Needs a model node connected to sub-model. Memory (sub-memory) and tools (sub-tools) are optional; any action node can be a tool, and a tool\'s field that the agent should fill in is written {{$fromAI "name" "what it is"}}. The answer is at {{<variableName>.output}}.',
  },
  BUFFER_MEMORY: {
    fields: [
      {
        name: "sessionId",
        type: "text",
        required: true,
        default: "{{sessionId}}",
        description: "What keeps conversations apart.",
      },
      { name: "windowSize", type: "number", default: 10, description: "Messages remembered, 1 to 50." },
    ],
    notes: "Only useful connected to an AI Agent's sub-memory port.",
  },

  // --------------------------------------------------------------- network
  HTTP_REQUEST: {
    credential: "HTTP_BASIC_AUTH, HTTP_BEARER_AUTH, HTTP_HEADER_AUTH or HTTP_QUERY_AUTH (only when authentication is not none)",
    credentialOptional: true,
    variableName: "myApiCall",
    fields: [
      variableName("myApiCall"),
      {
        name: "method",
        type: "select",
        required: true,
        options: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
        default: "GET",
      },
      {
        name: "endpoint",
        type: "text",
        required: true,
        description: "A public http(s) URL.",
        example: "https://api.example.com/users/{{webhook.body.id}}",
      },
      {
        name: "authentication",
        type: "select",
        options: ["none", "basic", "bearer", "header", "query"],
        default: "none",
        description: "The secret itself is a credential the user picks. Never put keys in headers or the URL: an API that takes its key as a URL parameter uses \"query\".",
      },
      { name: "queryParams", type: "textarea", description: "One name=value per line, or a JSON object." },
      { name: "headers", type: "textarea", description: "One Name: value per line, or a JSON object." },
      { name: "bodyType", type: "select", options: ["json", "form", "raw", "none"], default: "json" },
      { name: "body", type: "textarea", description: "For POST, PUT and PATCH. Insert objects with {{json variable}}." },
      { name: "rawContentType", type: "text", description: "For bodyType raw." },
      {
        name: "responseFormat",
        type: "select",
        options: ["auto", "file"],
        default: "auto",
        description: "file stores a download (a PDF, an image) at {{<variableName>.httpResponse.file}}.",
      },
      { name: "timeout", type: "text", description: "Seconds." },
      { name: "neverError", type: "boolean", default: false, description: "true: a 4xx or 5xx answer does not fail the node." },
    ],
    notes:
      "The answer is at {{<variableName>.httpResponse.data}}, its status at {{<variableName>.httpResponse.status}}.",
  },
  WEBHOOK_RESPONSE: {
    userConfigured: ["Webhook URL"],
    fields: [
      { name: "responseMessage", type: "text", required: true },
      { name: "responseStatus", type: "select", required: true, options: ["success", "error"], default: "success" },
    ],
  },

  // ------------------------------------------------------------- messaging
  SLACK: {
    userConfigured: ["Webhook URL (a Slack incoming webhook)"],
    variableName: "slack",
    fields: [
      variableName("slack"),
      { name: "content", type: "textarea", required: true, description: "The message." },
    ],
  },
  DISCORD: {
    userConfigured: ["Webhook URL (a Discord channel webhook)"],
    variableName: "discord",
    fields: [
      variableName("discord"),
      { name: "content", type: "textarea", required: true, description: "The message, 2000 characters at most." },
      { name: "username", type: "text", description: "The name the message is posted under." },
    ],
  },
  EMAIL_SEND: {
    credential: "SMTP",
    fields: [
      { name: "recipient", type: "text", required: true, example: "{{form.email}}" },
      { name: "subject", type: "text", required: true },
      { name: "body", type: "textarea", required: true },
      { name: "attachments", type: "text", description: "File variables, comma-separated.", example: "pdf.file" },
    ],
  },
  TELEGRAM: {
    credential: "TELEGRAM",
    variableName: "telegram",
    fields: [
      variableName("telegram"),
      {
        name: "chatId",
        type: "text",
        required: true,
        description: "A chat ID or @channel. After a Telegram Trigger: {{telegram.message.chat.id}}.",
      },
      { name: "text", type: "textarea", required: true },
      { name: "parseMode", type: "select", options: ["HTML", "MarkdownV2", "None"], default: "None" },
      { name: "file", type: "text", description: "A file variable to send as a document.", example: "pdf.file" },
    ],
  },

  // ------------------------------------------------------------------ apps
  GOOGLE_SHEETS: {
    credential: "GOOGLE_SHEETS or GOOGLE_OAUTH2",
    variableName: "sheetsResult",
    fields: [
      {
        name: "sheetId",
        type: "text",
        description:
          "The spreadsheet's ID from its URL. Only the user knows it: leave it empty unless they gave it.",
      },
      { name: "sheetName", type: "text", required: true, default: "Sheet1" },
      {
        name: "rowData",
        type: "text",
        required: true,
        description: "The values of the new row, comma-separated, one per column.",
        example: "{{form.name}}, {{form.email}}",
      },
      variableName("sheetsResult"),
    ],
    notes: "Appends one row.",
  },
  GOOGLE_CALENDAR: {
    credential: "GOOGLE_CALENDAR or GOOGLE_OAUTH2",
    variableName: "calendarResult",
    fields: [
      { name: "operation", type: "select", required: true, options: ["create", "update", "delete"], default: "create" },
      { name: "calendarId", type: "text", required: true, default: "primary" },
      { name: "eventId", type: "text", description: "For update and delete." },
      { name: "summary", type: "text", description: "The event's title." },
      { name: "description", type: "text" },
      { name: "startTime", type: "text", description: "ISO date and time.", example: "2026-12-31T10:00:00Z" },
      { name: "endTime", type: "text", description: "ISO date and time." },
      variableName("calendarResult"),
    ],
    notes: "{{<variableName>.htmlLink}} is the event's link, {{<variableName>.id}} its ID.",
  },
  NOTION: {
    credential: "NOTION",
    variableName: "notionResult",
    fields: [
      variableName("notionResult"),
      { name: "operation", type: "select", required: true, options: ["create_page", "query_database"], default: "create_page" },
      {
        name: "databaseId",
        type: "text",
        description: "The database's 32-character ID. Only the user knows it: leave it empty unless they gave it.",
      },
      {
        name: "propertiesJson",
        type: "json",
        required: true,
        description: "The page's properties in the Notion API's shape, as a JSON string.",
        example: '{"Name":{"title":[{"text":{"content":"{{form.name}}"}}]}}',
      },
    ],
  },
};

// The AI Agent is the one node whose main handles have their own ids
export const getMainInput = (inputs: { id: string }[]) =>
  inputs.find((port) => !port.id.startsWith("sub-"))?.id ?? MAIN_INPUT.id;
