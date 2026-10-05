"use client";

import { CredentialType } from "@prisma/client";
import {
  AlertTriangle,
  ArrowDownUp,
  CopyMinus,
  Group,
  ListEnd,
  OctagonX,
  Reply,
  Sigma,
  Split,
  Workflow,
} from "lucide-react";
import { createIntegrationNode } from "../integration-node";
import type { IntegrationConfig, IntegrationField } from "../integration-dialog";
import { SUMMARIZE_AGGREGATIONS } from "../../lib/list-ops";
import { CHAT_MODEL_PROVIDERS } from "../../lib/chat-model-providers";

// =========================================================================
// RESPOND TO WEBHOOK
// =========================================================================
export const respondToWebhookConfig: IntegrationConfig = {
  label: "Respond to Webhook",
  description:
    "Answers the HTTP request that started this workflow. Set the Webhook trigger's Respond option to \"Using 'Respond to Webhook' Node\".",
  logo: Reply,
  summary: "Send the HTTP response",
  fields: [
    {
      name: "respondWith",
      label: "Respond With",
      type: "select",
      defaultValue: "json",
      required: true,
      options: [
        { value: "json", label: "JSON" },
        { value: "text", label: "Text" },
        { value: "allData", label: "All Workflow Data" },
        { value: "noData", label: "No Data" },
        { value: "redirect", label: "Redirect" },
      ],
    },
    {
      name: "responseBody",
      label: "Response Body",
      type: "textarea",
      placeholder: '{\n  "ok": true,\n  "answer": "{{output}}"\n}',
      description:
        "Used for JSON and Text. Insert objects and lists with {{json variable}}.",
    },
    {
      name: "redirectUrl",
      label: "Redirect URL",
      placeholder: "https://example.com/thanks",
      description: "Used for Redirect.",
    },
    {
      name: "responseCode",
      label: "Response Code",
      placeholder: "200",
    },
    {
      name: "responseHeaders",
      label: "Response Headers",
      type: "textarea",
      placeholder: "Cache-Control: no-store",
      description: "One Name: value per line, or a JSON object.",
    },
  ],
};

export const RespondToWebhookNode = createIntegrationNode(
  respondToWebhookConfig,
  (data) =>
    respondToWebhookConfig.fields[0].options?.find(
      (option) => option.value === data.respondWith
    )?.label
);

// =========================================================================
// STOP AND ERROR
// =========================================================================
export const stopAndErrorConfig: IntegrationConfig = {
  label: "Stop and Error",
  description:
    "Fails the workflow with your own message. Use it after an IF to stop on bad data; an Error Trigger receives the message.",
  logo: OctagonX,
  summary: "Fail the workflow",
  fields: [
    {
      name: "errorMessage",
      label: "Error Message",
      type: "textarea",
      placeholder: "Order {{webhook.body.id}} has no customer email",
      required: true,
    },
  ],
};

export const StopAndErrorNode = createIntegrationNode(
  stopAndErrorConfig,
  (data) => data.errorMessage
);

// =========================================================================
// LIST NODES
// =========================================================================
const inputListField: IntegrationField = {
  name: "inputPath",
  label: "Input List",
  placeholder: "myApiCall.httpResponse.data",
  description:
    "The variable that holds the list. Leave empty to use the items coming from the list node connected before this one.",
};

const LIST_HINT =
  "The nodes connected after this one run once for every item, with the item as {{item}} or {{ $json }} (for example {{item.name}}). Add an Aggregate node to collect the results into one list again. The whole list is also at {{json <name>.items}}.";

export const splitOutConfig: IntegrationConfig = {
  label: "Split Out",
  description:
    "Turns a list inside your data into separate items, for example the line items of each order.",
  logo: Split,
  defaultVariableName: "splitOut",
  hint: LIST_HINT,
  fields: [
    {
      ...inputListField,
      description:
        "A list of objects, or one object, that contains the list to split out.",
    },
    {
      name: "field",
      label: "Field To Split Out",
      placeholder: "lineItems",
      description:
        "The field that holds the list. Leave empty when the input is already the list.",
    },
    {
      name: "include",
      label: "Include",
      type: "select",
      defaultValue: "none",
      options: [
        { value: "none", label: "No Other Fields" },
        { value: "all", label: "All Other Fields" },
      ],
    },
  ],
};

export const SplitOutNode = createIntegrationNode(splitOutConfig, (data) =>
  data.field ? `Split ${data.field}` : data.inputPath
);

export const aggregateConfig: IntegrationConfig = {
  label: "Aggregate",
  description: "Combines a field from many items into a single list.",
  logo: Group,
  defaultVariableName: "aggregate",
  operations: [
    { value: "field", label: "Individual Field" },
    { value: "all", label: "All Item Data (Into a Single List)" },
  ],
  hint: "The result is one object: {{json <name>}}. Aggregate ends a per-item section: the nodes after it run once again.",
  fields: [
    inputListField,
    {
      name: "field",
      label: "Field To Aggregate",
      placeholder: "email",
      required: true,
      operations: ["field"],
    },
    {
      name: "outputField",
      label: "Output Field Name",
      placeholder: "emails",
      description: "Defaults to the field's name, or to data.",
    },
  ],
};

export const AggregateNode = createIntegrationNode(aggregateConfig, (data) =>
  data.operation === "all" ? "All item data" : data.field
);

export const sortConfig: IntegrationConfig = {
  label: "Sort",
  description: "Orders the items of a list.",
  logo: ArrowDownUp,
  defaultVariableName: "sorted",
  hint: LIST_HINT,
  fields: [
    inputListField,
    {
      name: "field",
      label: "Field To Sort By",
      placeholder: "createdAt",
      description: "Leave empty to sort a list of plain values.",
    },
    {
      name: "order",
      label: "Order",
      type: "select",
      defaultValue: "asc",
      required: true,
      options: [
        { value: "asc", label: "Ascending" },
        { value: "desc", label: "Descending" },
      ],
    },
  ],
};

export const SortNode = createIntegrationNode(sortConfig, (data) =>
  data.field
    ? `${data.field} ${data.order === "desc" ? "descending" : "ascending"}`
    : undefined
);

export const limitConfig: IntegrationConfig = {
  label: "Limit",
  description: "Keeps only the first or last items of a list.",
  logo: ListEnd,
  defaultVariableName: "limited",
  hint: LIST_HINT,
  fields: [
    inputListField,
    {
      name: "maxItems",
      label: "Max Items",
      placeholder: "10",
      defaultValue: "1",
      required: true,
    },
    {
      name: "keep",
      label: "Keep",
      type: "select",
      defaultValue: "first",
      required: true,
      options: [
        { value: "first", label: "First Items" },
        { value: "last", label: "Last Items" },
      ],
    },
  ],
};

export const LimitNode = createIntegrationNode(limitConfig, (data) =>
  data.maxItems ? `Keep ${data.keep || "first"} ${data.maxItems}` : undefined
);

export const removeDuplicatesConfig: IntegrationConfig = {
  label: "Remove Duplicates",
  description: "Removes items that repeat an earlier item.",
  logo: CopyMinus,
  defaultVariableName: "unique",
  hint: LIST_HINT,
  fields: [
    inputListField,
    {
      name: "fields",
      label: "Fields To Compare",
      placeholder: "email, phone",
      description:
        "Comma-separated. Leave empty to compare whole items.",
    },
  ],
};

export const RemoveDuplicatesNode = createIntegrationNode(
  removeDuplicatesConfig,
  (data) => (data.fields ? `By ${data.fields}` : "Compare all fields")
);

export const summarizeConfig: IntegrationConfig = {
  label: "Summarize",
  description: "Counts, sums or averages a list, like a pivot table.",
  logo: Sigma,
  defaultVariableName: "summary",
  operations: SUMMARIZE_AGGREGATIONS.map((option) => ({ ...option })),
  hint: "Each group becomes one item in {{json <name>.items}}, with the result named like sum_amount or count_id.",
  fields: [
    inputListField,
    {
      name: "field",
      label: "Field",
      placeholder: "amount",
      description: "The field to summarize. Optional for Count.",
    },
    {
      name: "groupBy",
      label: "Fields To Split By",
      placeholder: "country, plan",
      description: "Comma-separated. Leave empty for one total.",
    },
  ],
};

export const SummarizeNode = createIntegrationNode(summarizeConfig, (data) => {
  const label = SUMMARIZE_AGGREGATIONS.find(
    (option) => option.value === data.operation
  )?.label;

  return label ? `${label}${data.field ? ` of ${data.field}` : ""}` : undefined;
});

// =========================================================================
// EXECUTE WORKFLOW
// =========================================================================
export const executeWorkflowConfig: IntegrationConfig = {
  label: "Execute Workflow",
  description:
    'Runs another of your workflows. That workflow must start with a "When Executed by Another Workflow" trigger.',
  logo: Workflow,
  defaultVariableName: "subWorkflow",
  hint: 'As an AI Agent tool, the agent\'s arguments are passed to the workflow: use {{$fromAI "name" "what it is"}} in Workflow Input.',
  fields: [
    {
      name: "workflowId",
      label: "Workflow",
      type: "workflow",
      required: true,
    },
    {
      name: "inputMode",
      label: "Workflow Input",
      type: "select",
      defaultValue: "all",
      required: true,
      options: [
        { value: "all", label: "All data of this workflow" },
        { value: "define", label: "Define below" },
      ],
    },
    {
      name: "inputJson",
      label: "Input Data",
      type: "textarea",
      placeholder: '{\n  "customerId": "{{webhook.body.id}}"\n}',
      description:
        'Used for "Define below". A JSON object; its fields become the sub-workflow\'s variables.',
    },
    {
      name: "waitForCompletion",
      label: "Wait For Sub-Workflow Completion",
      type: "select",
      defaultValue: "yes",
      required: true,
      options: [
        { value: "yes", label: "Yes: return its data" },
        { value: "no", label: "No: start it and continue" },
      ],
    },
  ],
};

export const ExecuteWorkflowNode = createIntegrationNode(
  executeWorkflowConfig,
  (data) => (data.workflowId ? "Run sub-workflow" : "Not Configured")
);

// =========================================================================
// GMAIL
// =========================================================================
const messageIdField: IntegrationField = {
  name: "messageId",
  label: "Message ID",
  placeholder: "{{gmail.messages.0.id}}",
  required: true,
};

export const gmailConfig: IntegrationConfig = {
  label: "Gmail",
  description: "Send, reply to and read emails with your Google account.",
  logo: "/logos/gmail.svg",
  credentialType: CredentialType.GOOGLE_OAUTH2,
  credentialLabel: "Google Account",
  defaultVariableName: "gmail",
  operations: [
    { value: "send_email", label: "Send a Message" },
    { value: "reply", label: "Reply to a Message" },
    { value: "search_messages", label: "Get Many Messages" },
    { value: "get_message", label: "Get a Message" },
    { value: "mark_as_read", label: "Mark a Message as Read" },
  ],
  fields: [
    {
      name: "to",
      label: "To",
      placeholder: "customer@example.com",
      description: "Separate several addresses with commas.",
      required: true,
      operations: ["send_email"],
    },
    {
      name: "subject",
      label: "Subject",
      placeholder: "Your order is confirmed",
      required: true,
      operations: ["send_email"],
    },
    {
      ...messageIdField,
      operations: ["reply", "get_message", "mark_as_read"],
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
      operations: ["send_email", "reply"],
    },
    {
      name: "message",
      label: "Message",
      type: "textarea",
      placeholder: "Hi {{webhook.body.name}},\n\nThanks for your order.",
      required: true,
      operations: ["send_email", "reply"],
    },
    {
      name: "cc",
      label: "CC",
      placeholder: "team@example.com",
      operations: ["send_email"],
    },
    {
      name: "bcc",
      label: "BCC",
      placeholder: "archive@example.com",
      operations: ["send_email"],
    },
    {
      name: "attachments",
      label: "Attachments",
      placeholder: "pdf.file, report.file",
      description:
        "File variables, comma-separated: files made by PDF Generator, Convert to File, Google Drive or an HTTP Request download.",
      operations: ["send_email"],
    },
    {
      name: "query",
      label: "Search",
      placeholder: "is:unread from:customer@example.com newer_than:1d",
      description: "The same search syntax as the Gmail search box.",
      operations: ["search_messages"],
    },
    {
      name: "limit",
      label: "Limit",
      placeholder: "10",
      description: "How many messages to return (up to 50).",
      operations: ["search_messages"],
    },
  ],
};

export const GmailNode = createIntegrationNode(gmailConfig, (data) =>
  data.operation === "send_email" && data.to ? `To: ${data.to}` : undefined
);

// =========================================================================
// CHAT MODEL (OpenAI-compatible providers)
// =========================================================================
export const chatModelConfig: IntegrationConfig = {
  label: "Chat Model",
  description:
    "OpenRouter, Groq, DeepSeek, Mistral, Together, Ollama or any OpenAI-compatible API. Connect it to an AI Agent's Chat Model port, or run it as a step with a prompt.",
  logo: "/logos/chat-model.svg",
  credentialType: CredentialType.OPENAI_COMPATIBLE,
  credentialLabel: "API Key Credential",
  defaultVariableName: "chatModel",
  hint: "The answer is at {{<name>.text}}. The prompts are only used when the node runs as a step; an AI Agent brings its own.",
  fields: [
    {
      name: "provider",
      label: "Provider",
      type: "select",
      defaultValue: "openrouter",
      required: true,
      options: CHAT_MODEL_PROVIDERS.map(({ value, label }) => ({ value, label })),
    },
    {
      name: "model",
      label: "Model",
      placeholder: "openai/gpt-4o-mini, llama-3.3-70b-versatile, deepseek-chat...",
      description: "The model's ID exactly as the provider lists it.",
      required: true,
    },
    {
      name: "baseUrl",
      label: "Base URL",
      placeholder: "https://api.example.com/v1",
      description:
        "Required for Custom. For Ollama, the server's address if it is not http://localhost:11434/v1; a local address also needs ALLOW_PRIVATE_NETWORK_REQUESTS=true on the server.",
    },
    {
      name: "systemPrompt",
      label: "System Prompt",
      type: "textarea",
      placeholder: "You are a helpful assistant.",
    },
    {
      name: "userPrompt",
      label: "User Prompt",
      type: "textarea",
      placeholder: "Summarize this: {{webhook.body.text}}",
    },
  ],
};

export const ChatModelNode = createIntegrationNode(chatModelConfig, (data) =>
  data.model
    ? `${CHAT_MODEL_PROVIDERS.find((provider) => provider.value === data.provider)?.label || "Chat Model"}: ${data.model}`
    : undefined
);

// =========================================================================
// TRIGGERS
// =========================================================================
export const errorTriggerConfig: IntegrationConfig = {
  label: "Error Trigger",
  description:
    "Starts when a workflow fails, so you can send yourself an alert. The workflow does not need to be active.",
  logo: AlertTriangle,
  trigger: true,
  summary: "When a workflow fails",
  hint: "Available variables: {{execution.error.message}}, {{execution.id}}, {{execution.lastNodeExecuted}}, {{workflow.name}} and {{workflow.id}}.",
  fields: [
    {
      name: "scope",
      label: "Listen To",
      type: "select",
      defaultValue: "this",
      required: true,
      options: [
        { value: "this", label: "Failures of this workflow" },
        { value: "all", label: "Failures of all my workflows" },
      ],
    },
  ],
};

export const ErrorTriggerNode = createIntegrationNode(
  errorTriggerConfig,
  (data) =>
    data.scope === "all"
      ? "When any of my workflows fails"
      : "When this workflow fails"
);

export const telegramTriggerConfig: IntegrationConfig = {
  label: "Telegram Trigger",
  description:
    "Starts when your bot receives a message. The bot's webhook is registered with Telegram when you activate the workflow, which needs a public https address.",
  logo: "/logos/telegram.jfif",
  trigger: true,
  credentialType: CredentialType.TELEGRAM,
  credentialLabel: "Telegram Bot Credential",
  summary: "On message",
  hint: "Available variables: {{telegram.message.text}}, {{telegram.message.chat.id}}, {{telegram.message.from.first_name}}, plus {{chatInput}} and {{sessionId}} for an AI Agent. Reply with a Telegram node using Chat ID {{telegram.message.chat.id}}. A bot can serve one workflow at a time.",
  fields: [],
};

export const TelegramTriggerNode = createIntegrationNode(telegramTriggerConfig);

export const whatsappTriggerConfig: IntegrationConfig = {
  label: "WhatsApp Trigger",
  description:
    "Starts when your WhatsApp Business number receives a message. Activate the workflow first, then add the Webhook URL and Verify Token under WhatsApp > Configuration in your Meta app and subscribe to the messages field.",
  logo: "/logos/whatsapp.svg",
  trigger: true,
  webhookPath: "whatsapp",
  summary: "On message",
  hint: "Available variables: {{whatsapp.text}}, {{whatsapp.from}}, {{whatsapp.name}}, {{whatsapp.phoneNumberId}}, plus {{chatInput}} and {{sessionId}} for an AI Agent. Reply with a WhatsApp node using Recipient {{whatsapp.from}}.",
  fields: [
    {
      name: "verifyToken",
      label: "Verify Token",
      placeholder: "any-text-you-choose",
      description: "Type the same text into Meta's Verify Token field.",
      required: true,
    },
    {
      name: "appSecret",
      label: "App Secret",
      placeholder: "From Meta app > App settings > Basic",
      description:
        "Used to check that each message really comes from Meta. Messages are rejected without it.",
      required: true,
    },
  ],
};

export const WhatsappTriggerNode = createIntegrationNode(
  whatsappTriggerConfig,
  (data) => (data.appSecret ? "On message" : "Not Configured")
);

export const executeWorkflowTriggerConfig: IntegrationConfig = {
  label: "When Executed by Another Workflow",
  description:
    "Starts when an Execute Workflow node (or an AI Agent using it as a tool) calls this workflow.",
  logo: Workflow,
  trigger: true,
  summary: "Sub-workflow start",
  hint: "The data the calling workflow passes in is available under the same variable names. Whatever this workflow produces is returned to the caller.",
  fields: [],
};

export const ExecuteWorkflowTriggerNode = createIntegrationNode(
  executeWorkflowTriggerConfig
);
