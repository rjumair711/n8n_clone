"use client";

import { CredentialType } from "@prisma/client";
import { Braces, DatabaseZap, FolderSync, Plug, ScanEye, ScanText, ServerCog, Tags } from "lucide-react";
import { createIntegrationNode } from "../integration-node";
import type { IntegrationConfig, IntegrationField } from "../integration-dialog";
import {
  DEFAULT_RERANK_MODELS,
  EMBEDDING_PROVIDERS,
  LOADER_DEFAULT_DOCUMENTS,
  LOADER_MAX_DOCUMENTS,
  RERANKERS,
} from "../../lib/rag-options";
import { SPLIT_MODES } from "../../lib/text-splitter";

// Kept in step with MCP_MIN_TOKEN_LENGTH in src/lib/mcp-server.ts (a test
// compares them); that file is not imported here to keep it off the page
const MCP_MIN_TOKEN_LENGTH = 16;
import { OTHER_CATEGORY_ID, parseAttributes, parseCategories } from "../../lib/ai-fields";
import { ANALYZE_MODES } from "../../lib/vision";

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
// ANALYZE IMAGE / DOCUMENT (OCR and vision)
// =========================================================================
export const analyzeDocumentConfig: IntegrationConfig = {
  label: "Analyze Image / Document",
  description:
    "Reads an image or a PDF with a vision model: all of its text (OCR), named fields, or a description. Connect a model that can read images to the Model port underneath: OpenAI, Gemini, Anthropic, or a Chat Model with a vision model such as GLM-4.6V or Qwen-VL.",
  logo: ScanEye,
  defaultVariableName: "analysis",
  subInputs: MODEL_PORT,
  operations: ANALYZE_MODES.map(({ value, label }) => ({ value, label })),
  hint: "Extract All Text gives {{<name>.text}}; Extract Fields gives {{<name>.output.<field>}} (null for a field the document does not have); Describe gives {{<name>.description}}. For a PDF, {{<name>.pagesRead}} and {{<name>.truncated}} say how much of it was read. Pages of a PDF that have text are read as text; scanned pages are sent to the model as images.",
  fields: [
    {
      name: "file",
      label: "File",
      placeholder: "form.invoice",
      description:
        "A file variable holding an image (JPEG, PNG, WebP, GIF, TIFF) or a PDF: from a Form Trigger upload, an HTTP Request download, Google Drive or Gmail. Leave empty inside a list of files.",
    },
    {
      name: "attributes",
      label: "Fields To Extract",
      type: "textarea",
      placeholder:
        "vendor: the company that issued the invoice\ninvoiceNumber\ninvoiceDate (date)\ntotal (number): the amount to pay\nlineItems (list)",
      description:
        "One per line, as name (type): description. Types: string, number, boolean, date, list. Type and description are optional. The same format as the Information Extractor.",
      required: true,
      operations: ["extract_fields"],
    },
    {
      name: "instructions",
      label: "What To Describe",
      type: "textarea",
      placeholder: "What is in this picture? Is anything damaged?",
      description: "Leave empty for a general description.",
      operations: ["describe"],
    },
    {
      name: "maxPages",
      label: "Max Pages (PDF)",
      placeholder: "5",
      defaultValue: "5",
      description:
        "How many pages of a PDF are read, from the first. Every scanned page is an image the model is paid to read. The server's limit is 20 (VISION_MAX_PDF_PAGES).",
    },
  ],
};

export const AnalyzeDocumentNode = createIntegrationNode(
  analyzeDocumentConfig,
  (data) =>
    ANALYZE_MODES.find((mode) => mode.value === data.operation)?.label
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

const splitFields = (operations?: string[]): IntegrationField[] => [
  {
    name: "splitBy",
    label: "Split By",
    type: "select",
    defaultValue: "characters",
    required: true,
    options: SPLIT_MODES,
    description:
      "How long text is cut into chunks. Markdown headings keeps each section together and starts every chunk with the headings it sits under.",
    operations,
  },
  {
    name: "chunkSize",
    label: "Chunk Size",
    placeholder: "1000 characters, or 250 tokens",
    description:
      "Characters per chunk (the most for a section, with Markdown headings), or tokens with Split By Tokens. Tokens are estimated at four characters each.",
    operations,
  },
  {
    name: "chunkOverlap",
    label: "Chunk Overlap",
    placeholder: "100 characters, or 25 tokens",
    description: "How much neighbouring chunks share, so a sentence cut in two is whole in one of them. 0 for none.",
    operations,
  },
];

const embeddingFields = (operations?: string[]): IntegrationField[] => [
  {
    name: "embeddingProvider",
    label: "Embeddings Provider",
    type: "select",
    defaultValue: "openai",
    required: true,
    options: EMBEDDING_PROVIDERS,
    operations,
  },
  {
    name: "embeddingModel",
    label: "Embedding Model",
    placeholder: "text-embedding-3-small / gemini-embedding-001",
    description:
      "Leave empty for the provider's default. Required for OpenAI-compatible.",
    operations,
  },
  {
    name: "baseUrl",
    label: "Base URL",
    placeholder: "https://api.example.com/v1",
    description: "Only for OpenAI-compatible.",
    operations,
    showWhen: (values) => values.embeddingProvider === "compatible",
  },
];

const RERANK_CREDENTIALS: Record<string, CredentialType> = {
  cohere: CredentialType.COHERE,
  jina: CredentialType.JINA_READER,
};

export const vectorStoreConfig: IntegrationConfig = {
  label: "Vector Store",
  description:
    "Saves text so it can be found by meaning later (RAG). Insert your documents once, then search them, or connect the node to an AI Agent's Tools port so the agent can look things up.",
  logo: DatabaseZap,
  // Only used by a search with Rerank With set to the connected chat model
  subInputs: [{ id: "sub-model", label: "Rerank Model" }],
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
  hint: 'Search results are at {{json <name>.matches}}, and as one block of text at {{<name>.text}}; {{<name>.engine}} says whether the database (pgvector) or the app compared the embeddings. As an AI Agent tool, set Query to {{$fromAI "query" "what to look up"}}. Insert and Search must use the same embedding model.',
  fields: [
    {
      name: "collection",
      label: "Collection",
      placeholder: "default",
      defaultValue: "default",
      description: "A name for this set of documents, for example faq or products.",
      required: true,
    },
    ...embeddingFields(["search", "insert"]),
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
      description:
        "A JSON object saved with every chunk and returned by searches. A search can filter on it.",
      operations: ["insert"],
    },
    {
      name: "documentId",
      label: "Document ID",
      placeholder: "{{item.id}} or pricing-page",
      description:
        "A name of your own for this document. With it, inserting the same text again does nothing, and a changed text replaces the old chunks instead of adding to them.",
      operations: ["insert"],
    },
    ...splitFields(["insert"]),
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
    {
      name: "metadataFilter",
      label: "Metadata Filter",
      type: "textarea",
      placeholder: '{\n  "source": "pricing-page"\n}',
      description:
        "A JSON object. Only chunks whose metadata contains every field of it, with the same value, are searched.",
      operations: ["search"],
    },
    {
      name: "rerank",
      label: "Rerank With",
      type: "select",
      defaultValue: "none",
      required: true,
      options: RERANKERS,
      description:
        "A reranker reads the query together with each candidate and puts the best first. More candidates are fetched than Limit, and the best Limit are returned.",
      operations: ["search"],
    },
    {
      name: "rerankCredentialId",
      label: "Rerank Credential",
      type: "credential",
      credentialTypeFor: (values) => RERANK_CREDENTIALS[values.rerank || ""],
      description:
        "A Cohere credential, or a Jina credential (the same key as for Read Web Page). Add one under Credentials if the list is empty.",
      required: true,
      operations: ["search"],
      showWhen: (values) => (values.rerank || "") in RERANK_CREDENTIALS,
    },
    {
      name: "rerankModel",
      label: "Rerank Model",
      placeholder: `${DEFAULT_RERANK_MODELS.cohere} / ${DEFAULT_RERANK_MODELS.jina}`,
      description: "Leave empty for the provider's default.",
      operations: ["search"],
      showWhen: (values) => (values.rerank || "") in RERANK_CREDENTIALS,
    },
  ],
};

// =========================================================================
// DOCUMENT LOADER
// =========================================================================
const LOADER_CREDENTIALS: Record<string, CredentialType> = {
  google_drive_folder: CredentialType.GOOGLE_OAUTH2,
  notion_database: CredentialType.NOTION,
};

export const documentLoaderConfig: IntegrationConfig = {
  label: "Document Loader",
  description:
    "Loads every document of a Google Drive folder or a Notion database into a Vector Store collection. Run it again whenever you like, for example on a schedule: documents that have not changed are skipped, and changed ones replace their old chunks.",
  logo: FolderSync,
  credentialTypeFor: (values) =>
    LOADER_CREDENTIALS[values.operation || "google_drive_folder"],
  credentialLabel: "Source Credential",
  credentialHelp:
    "The Google account that can open the folder, or the Notion integration the database is shared with.",
  defaultVariableName: "loader",
  hint: "The result has {{<name>.added}}, {{<name>.updated}}, {{<name>.unchanged}}, {{<name>.skipped}} and {{<name>.failed}}, and one line per document at {{json <name>.documents}}. Search the collection with a Vector Store node that uses the same collection and embedding model.",
  operations: [
    { value: "google_drive_folder", label: "Google Drive Folder" },
    { value: "notion_database", label: "Notion Database" },
  ],
  fields: [
    {
      name: "folderId",
      label: "Folder",
      placeholder: "https://drive.google.com/drive/folders/...",
      description:
        "The folder's ID or its link. Google Docs, Sheets and Slides, PDFs, Word (.docx) and text files directly in the folder are read; sub-folders are not opened.",
      required: true,
      operations: ["google_drive_folder"],
    },
    {
      name: "databaseId",
      label: "Database",
      placeholder: "https://www.notion.so/workspace/...",
      description:
        "The database's ID or its link. Share the database with your Notion integration first. Each row is one document: its properties and its page content.",
      required: true,
      operations: ["notion_database"],
    },
    {
      name: "collection",
      label: "Collection",
      placeholder: "default",
      defaultValue: "default",
      description: "The Vector Store collection the documents go into.",
      required: true,
    },
    ...embeddingFields(),
    {
      name: "embeddingCredentialId",
      label: "Embeddings Credential",
      type: "credential",
      credentialTypeFor: (values) =>
        EMBEDDING_CREDENTIALS[values.embeddingProvider || "openai"],
      description:
        "The key of the embedding model. Add one under Credentials if the list is empty.",
      required: true,
    },
    ...splitFields(),
    {
      name: "maxDocuments",
      label: "Max Documents",
      placeholder: String(LOADER_DEFAULT_DOCUMENTS),
      description: `How many documents one run reads, the most recently changed first (up to ${LOADER_MAX_DOCUMENTS}).`,
    },
    {
      name: "metadataJson",
      label: "Metadata",
      type: "textarea",
      placeholder: '{\n  "team": "support"\n}',
      description:
        "A JSON object saved with every chunk, next to the document's source, title and url.",
    },
    {
      name: "removeMissing",
      label: "Remove Deleted Documents",
      type: "switch",
      defaultValue: "false",
      description:
        "Also remove from the collection the documents that are no longer in the folder or database. Only done when the run saw all of them (not more than Max Documents).",
    },
  ],
};

export const DocumentLoaderNode = createIntegrationNode(documentLoaderConfig, (data) =>
  data.folderId || data.databaseId
    ? `${documentLoaderConfig.operations?.find((option) => option.value === data.operation)?.label ?? "Google Drive Folder"} → ${data.collection || "default"}`
    : "Not Configured"
);

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
  hint: "Streamable HTTP is one URL, usually ending in /mcp. Older servers use SSE: one URL, usually ending in /sse, that the client keeps open. Servers that only run locally over stdio are not supported.",
  fields: [
    {
      name: "endpoint",
      label: "Endpoint",
      placeholder: "https://example.com/mcp",
      required: true,
    },
    {
      name: "transport",
      label: "Transport",
      type: "select",
      defaultValue: "http",
      required: true,
      options: [
        { value: "http", label: "Streamable HTTP" },
        { value: "sse", label: "SSE (older servers)" },
      ],
      description:
        "How the server is spoken to. Try Streamable HTTP first; choose SSE when the server's address ends in /sse or it answers 404 or 405.",
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
// MCP SERVER TRIGGER
// =========================================================================
export const mcpServerTriggerConfig: IntegrationConfig = {
  label: "MCP Server Trigger",
  description:
    "Makes this workflow a tool that MCP clients (Claude, Cursor, another agent) can call. Each MCP Server Trigger node is one tool: a call runs the workflow from this node and returns its result. The workflow has to be active.",
  logo: ServerCog,
  trigger: true,
  endpointUrl: {
    path: "/api/mcp",
    label: "MCP Server URL",
    help: "Add this to the MCP client as a Streamable HTTP server, with the header Authorization: Bearer <your token>. All MCP Server Trigger nodes of the workflow share it.",
  },
  summary: "On tool call",
  hint: "Available variables: {{mcp.arguments.<parameter>}} for what the caller passed, {{json mcp.arguments}} and {{mcp.tool}}. What the caller gets back: the body of a Respond to Webhook node if one runs, otherwise the Result variable, otherwise everything the run produced. With several MCP Server Trigger nodes, only the branch of the tool that was called runs.",
  fields: [
    {
      name: "toolName",
      label: "Tool Name",
      placeholder: "look_up_order",
      description:
        "Letters, digits, _ and -. This is what the calling model sees, so say what the tool does.",
      required: true,
    },
    {
      name: "toolDescription",
      label: "Tool Description",
      type: "textarea",
      placeholder:
        "Finds an order by its number and returns its status, items and delivery date.",
      description:
        "The calling model decides from this when to use the tool. Say what it does and what it returns.",
      required: true,
    },
    {
      name: "parameters",
      label: "Parameters",
      type: "textarea",
      placeholder:
        "orderId (string): The order number, like 1001\nincludeItems (boolean, optional): Also return the line items",
      description:
        "One per line, as name (type): description. Types: string, number, integer, boolean, list, object. A parameter is required unless it says optional.",
    },
    {
      name: "inputSchema",
      label: "Input Schema (JSON)",
      type: "textarea",
      placeholder:
        '{\n  "type": "object",\n  "properties": { "orderId": { "type": "string" } },\n  "required": ["orderId"]\n}',
      description:
        "For a schema the lines above cannot express. A JSON Schema of type object; when filled in, it is used instead of Parameters.",
      warning: (value) => {
        if (!value.trim()) return undefined;

        try {
          const schema = JSON.parse(value);

          return schema && typeof schema === "object" && schema.type === "object"
            ? undefined
            : 'The schema must be a JSON object with "type": "object". Parameters are used instead.';
        } catch {
          return "This is not valid JSON. Parameters are used instead.";
        }
      },
    },
    {
      name: "resultPath",
      label: "Result",
      placeholder: "agent.output",
      description:
        "The variable to return to the caller. Leave empty to return everything the run produced.",
    },
    {
      name: "secret",
      label: "Bearer Token",
      placeholder: "a-long-random-text-of-16-or-more-characters",
      description:
        "Callers must send it as Authorization: Bearer <token>. Use the same token on every MCP Server Trigger of the workflow; a tool is only offered to callers that have its node's token.",
      required: true,
      warning: (value) =>
        value.trim() && value.trim().length < MCP_MIN_TOKEN_LENGTH
          ? `Use at least ${MCP_MIN_TOKEN_LENGTH} characters. Calls with a shorter token are refused.`
          : undefined,
    },
  ],
};

export const McpServerTriggerNode = createIntegrationNode(
  mcpServerTriggerConfig,
  (data) =>
    data.toolName && data.secret ? `Tool: ${data.toolName}` : "Not Configured"
);

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
