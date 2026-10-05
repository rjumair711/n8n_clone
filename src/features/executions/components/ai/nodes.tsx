"use client";

import { CredentialType } from "@prisma/client";
import { Braces, DatabaseZap, Plug, ScanText, Tags } from "lucide-react";
import { createIntegrationNode } from "../integration-node";
import type { IntegrationConfig } from "../integration-dialog";
import { OTHER_CATEGORY_ID, parseAttributes, parseCategories } from "../../lib/ai-fields";

const MODEL_PORT = [{ id: "sub-model", label: "Model" }];

// =========================================================================
// TEXT CLASSIFIER
// =========================================================================
export const textClassifierConfig: IntegrationConfig = {
  label: "Text Classifier",
  description:
    "Sorts text into one of your categories with a chat model, then continues on that category's output. Connect a model node to the Model port underneath.",
  logo: Tags,
  defaultVariableName: "classification",
  subInputs: MODEL_PORT,
  getOutputs: (data) => [
    ...parseCategories(data.categories).map((category) => ({
      id: category.id,
      label: category.name,
    })),
    { id: OTHER_CATEGORY_ID, label: "Other" },
  ],
  hint: "The chosen category is at {{<name>.category}}. Text that fits no category leaves through the Other output.",
  fields: [
    {
      name: "inputText",
      label: "Text To Classify",
      type: "textarea",
      placeholder: "{{chatInput}}",
      required: true,
    },
    {
      name: "categories",
      label: "Categories",
      type: "textarea",
      placeholder:
        "sales: questions about prices and plans\nsupport: something is broken\nspam",
      description:
        "One per line, as name: description. The description helps the model and is optional. Each category becomes an output.",
      required: true,
    },
    {
      name: "systemPrompt",
      label: "System Prompt",
      type: "textarea",
      placeholder: "You classify customer messages for a phone shop.",
    },
  ],
};

export const TextClassifierNode = createIntegrationNode(
  textClassifierConfig,
  (data) => {
    const count = parseCategories(data.categories).length;
    return count ? `${count} categor${count === 1 ? "y" : "ies"}` : "Not Configured";
  }
);

// =========================================================================
// INFORMATION EXTRACTOR
// =========================================================================
export const informationExtractorConfig: IntegrationConfig = {
  label: "Information Extractor",
  description:
    "Pulls named values out of free text with a chat model. Connect a model node to the Model port underneath.",
  logo: ScanText,
  defaultVariableName: "extracted",
  subInputs: MODEL_PORT,
  hint: "Each value is at {{<name>.output.<attribute>}}; attributes the text does not contain are null.",
  fields: [
    {
      name: "inputText",
      label: "Text",
      type: "textarea",
      placeholder: "{{gmail.text}}",
      required: true,
    },
    {
      name: "attributes",
      label: "Attributes",
      type: "textarea",
      placeholder:
        "customerName: the person who wrote the message\norderNumber (number)\ndeliveryDate (date): when they want it delivered\nitems (list)",
      description:
        "One per line, as name (type): description. Types: string, number, boolean, date, list. Type and description are optional.",
      required: true,
    },
    {
      name: "systemPrompt",
      label: "System Prompt",
      type: "textarea",
      placeholder: "You read order emails for a bakery.",
    },
  ],
};

export const InformationExtractorNode = createIntegrationNode(
  informationExtractorConfig,
  (data) => {
    const count = parseAttributes(data.attributes).length;
    return count ? `${count} attribute${count === 1 ? "" : "s"}` : "Not Configured";
  }
);

// =========================================================================
// STRUCTURED OUTPUT PARSER
// =========================================================================
export const structuredOutputParserConfig: IntegrationConfig = {
  label: "Structured Output Parser",
  description:
    "Makes an AI Agent answer with data instead of text. Connect it to the agent's Parser port.",
  logo: Braces,
  summary: "For an AI Agent's Parser port",
  hint: "The agent's {{output}} becomes an object: read its fields as {{output.fieldName}}. The run fails if the model does not answer in this structure.",
  fields: [
    {
      name: "jsonExample",
      label: "JSON Example or Schema",
      type: "textarea",
      placeholder:
        '{\n  "city": "Lahore",\n  "temperatureCelsius": 31,\n  "advice": "Take water with you"\n}',
      description:
        "An example of the answer you want, or a JSON Schema describing it.",
      required: true,
    },
  ],
};

export const StructuredOutputParserNode = createIntegrationNode(
  structuredOutputParserConfig
);

// =========================================================================
// VECTOR STORE
// =========================================================================
const EMBEDDING_CREDENTIALS: Record<string, CredentialType> = {
  openai: CredentialType.OPENAI,
  gemini: CredentialType.GEMINI,
  compatible: CredentialType.OPENAI_COMPATIBLE,
};

export const vectorStoreConfig: IntegrationConfig = {
  label: "Vector Store",
  description:
    "Saves text so it can be found by meaning later (RAG). Insert your documents once, then search them, or connect the node to an AI Agent's Tools port so the agent can look things up.",
  logo: DatabaseZap,
  credentialType: CredentialType.OPENAI,
  credentialTypeFor: (values) =>
    values.operation === "delete_collection"
      ? undefined
      : EMBEDDING_CREDENTIALS[values.embeddingProvider || "openai"],
  credentialLabel: "Embeddings Credential",
  defaultVariableName: "vectorStore",
  operations: [
    { value: "search", label: "Search Documents" },
    { value: "insert", label: "Insert Documents" },
    { value: "delete_collection", label: "Delete Collection" },
  ],
  hint: 'Search results are at {{json <name>.matches}}, and as one block of text at {{<name>.text}}. As an AI Agent tool, set Query to {{$fromAI "query" "what to look up"}}. Insert and Search must use the same embedding model.',
  fields: [
    {
      name: "collection",
      label: "Collection",
      placeholder: "default",
      defaultValue: "default",
      description: "A name for this set of documents, for example faq or products.",
      required: true,
    },
    {
      name: "embeddingProvider",
      label: "Embeddings Provider",
      type: "select",
      defaultValue: "openai",
      required: true,
      options: [
        { value: "openai", label: "OpenAI" },
        { value: "gemini", label: "Google Gemini" },
        { value: "compatible", label: "OpenAI-compatible (Ollama, Together...)" },
      ],
      operations: ["search", "insert"],
    },
    {
      name: "embeddingModel",
      label: "Embedding Model",
      placeholder: "text-embedding-3-small / gemini-embedding-001",
      description:
        "Leave empty for the provider's default. Required for OpenAI-compatible.",
      operations: ["search", "insert"],
    },
    {
      name: "baseUrl",
      label: "Base URL",
      placeholder: "https://api.example.com/v1",
      description: "Only for OpenAI-compatible.",
      operations: ["search", "insert"],
    },
    {
      name: "text",
      label: "Text",
      type: "textarea",
      placeholder: "{{myApiCall.httpResponse.data}}",
      description: "Long text is split into chunks automatically.",
      required: true,
      operations: ["insert"],
    },
    {
      name: "metadataJson",
      label: "Metadata",
      type: "textarea",
      placeholder: '{\n  "source": "pricing-page"\n}',
      description: "A JSON object saved with every chunk and returned by searches.",
      operations: ["insert"],
    },
    {
      name: "chunkSize",
      label: "Chunk Size",
      placeholder: "1000",
      description: "Characters per chunk.",
      operations: ["insert"],
    },
    {
      name: "chunkOverlap",
      label: "Chunk Overlap",
      placeholder: "100",
      operations: ["insert"],
    },
    {
      name: "query",
      label: "Query",
      placeholder: "{{chatInput}}",
      required: true,
      operations: ["search"],
    },
    {
      name: "topK",
      label: "Limit",
      placeholder: "4",
      description: "How many chunks to return (up to 20).",
      operations: ["search"],
    },
  ],
};

export const VectorStoreNode = createIntegrationNode(vectorStoreConfig, (data) =>
  data.collection
    ? `${vectorStoreConfig.operations?.find((option) => option.value === data.operation)?.label ?? "Search Documents"}: ${data.collection}`
    : undefined
);

// =========================================================================
// MCP CLIENT TOOL
// =========================================================================
const MCP_CREDENTIALS: Record<string, CredentialType> = {
  bearer: CredentialType.HTTP_BEARER_AUTH,
  header: CredentialType.HTTP_HEADER_AUTH,
};

export const mcpClientConfig: IntegrationConfig = {
  label: "MCP Client",
  description:
    "Gives an AI Agent the tools of an MCP server. Connect it to the agent's Tools port. Run on its own, it lists the server's tools.",
  logo: Plug,
  credentialTypeFor: (values) => MCP_CREDENTIALS[values.authentication || "none"],
  credentialLabel: "Credential",
  defaultVariableName: "mcp",
  hint: "The server must use the Streamable HTTP transport (one URL, usually ending in /mcp). Servers that only run locally over stdio, or the older SSE transport, are not supported.",
  fields: [
    {
      name: "endpoint",
      label: "Endpoint",
      placeholder: "https://example.com/mcp",
      required: true,
    },
    {
      name: "authentication",
      label: "Authentication",
      type: "select",
      defaultValue: "none",
      required: true,
      options: [
        { value: "none", label: "None" },
        { value: "bearer", label: "Bearer Auth" },
        { value: "header", label: "Header Auth" },
      ],
    },
    {
      name: "includeTools",
      label: "Tools To Include",
      placeholder: "search, get_page",
      description: "Comma-separated tool names. Leave empty for all of them.",
    },
  ],
};

export const McpClientNode = createIntegrationNode(mcpClientConfig, (data) => {
  if (!data.endpoint) return "Not Configured";

  try {
    return new URL(data.endpoint).host;
  } catch {
    return data.endpoint;
  }
});

// =========================================================================
// GMAIL TRIGGER
// =========================================================================
export const gmailTriggerConfig: IntegrationConfig = {
  label: "Gmail Trigger",
  description:
    "Starts when a new email arrives. The mailbox is checked on a schedule while the workflow is active; mail that was already there when you activated it does not start runs.",
  logo: "/logos/gmail.svg",
  trigger: true,
  credentialType: CredentialType.GOOGLE_OAUTH2,
  credentialLabel: "Google Account",
  summary: "On new email",
  hint: "Available variables: {{gmail.from}}, {{gmail.subject}}, {{gmail.text}}, {{gmail.snippet}}, {{gmail.date}}, {{gmail.id}} and {{gmail.threadId}}. Reply with a Gmail node using Message ID {{gmail.id}}.",
  fields: [
    {
      name: "query",
      label: "Search Filter",
      placeholder: "is:unread from:orders@example.com",
      description:
        "Only emails matching this Gmail search start the workflow. Leave empty for every new email.",
    },
    {
      name: "pollMinutes",
      label: "Check Every",
      type: "select",
      defaultValue: "1",
      required: true,
      options: [
        { value: "1", label: "Minute" },
        { value: "5", label: "5 minutes" },
        { value: "15", label: "15 minutes" },
        { value: "60", label: "Hour" },
      ],
    },
  ],
};

export const GmailTriggerNode = createIntegrationNode(gmailTriggerConfig, (data) =>
  data.query ? data.query : "On new email"
);
