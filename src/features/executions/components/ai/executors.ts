import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { cosineSimilarity, embed, embedMany, generateText, type EmbeddingModel } from "ai";
import { NonRetriableError } from "inngest";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { safeFetch } from "@/lib/ssrf";
import type { NodeExecutor } from "@/features/executions/types";
import { renderTemplate } from "../../lib/templates";
import { loadCredentialSecret, parseJsonField } from "../../lib/integration";
import { loadConnectedModel } from "../../lib/connected-model";
import {
  OTHER_CATEGORY_ID,
  extractJson,
  parseAttributes,
  parseCategories,
  splitText,
} from "../../lib/ai-fields";

const toAiError = (label: string, error: any) =>
  error instanceof NonRetriableError
    ? error
    : new NonRetriableError(`${label} node failed: ${error?.message || "unknown error"}`);

// =========================================================================
// TEXT CLASSIFIER
// =========================================================================
type TextClassifierData = {
  variableName?: string;
  inputText?: string;
  categories?: string;
  systemPrompt?: string;
};

/**
 * Asks the connected model which category the text belongs to. The engine
 * then follows only that category's output, like a Switch.
 */
export const textClassifierExecutor: NodeExecutor<TextClassifierData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
  allNodes,
  connections,
}) => {
  const variableName = data.variableName?.trim() || "classification";
  const categories = parseCategories(data.categories);

  if (categories.length === 0) {
    throw new NonRetriableError(
      "Text Classifier node: add at least one category"
    );
  }

  const text = renderTemplate(data.inputText, context).trim();
  if (!text) {
    throw new NonRetriableError("Text Classifier node: Text To Classify is empty");
  }

  const model = await loadConnectedModel({
    label: "Text Classifier",
    nodeId,
    userId,
    allNodes,
    connections,
    step,
  });

  const system = [
    renderTemplate(data.systemPrompt, context).trim() ||
      "You classify text into exactly one category.",
    "Categories:",
    ...categories.map(
      (category) =>
        `- ${category.name}${category.description ? `: ${category.description}` : ""}`
    ),
    `If none of the categories fits, answer "other".`,
    `Reply with only a JSON object in this form: {"category": "<category name>"}`,
  ].join("\n");

  try {
    const answer = await step.run(`text-classifier-${nodeId}`, async () => {
      const result = await generateText({
        model: model.create(),
        system,
        prompt: text,
      });

      return result.text;
    });

    const parsed = extractJson(answer) as { category?: unknown } | undefined;
    const chosen = String(parsed?.category ?? answer).trim().toLowerCase();

    const match =
      categories.find((category) => category.name.toLowerCase() === chosen) ??
      // A model that ignored the JSON instruction usually still names it
      (parsed?.category === undefined
        ? categories.find((category) =>
            chosen.includes(category.name.toLowerCase())
          )
        : undefined);

    const branch = match?.id ?? OTHER_CATEGORY_ID;

    return {
      ...context,
      // The engine follows only the connections leaving this output
      matchedBranch: branch,
      [variableName]: {
        category: match?.name ?? "other",
        branch,
      },
    };
  } catch (error) {
    throw toAiError("Text Classifier", error);
  }
};

// =========================================================================
// INFORMATION EXTRACTOR
// =========================================================================
type InformationExtractorData = {
  variableName?: string;
  inputText?: string;
  attributes?: string;
  systemPrompt?: string;
};

const coerceAttribute = (value: unknown, type: string): unknown => {
  if (value === undefined || value === null || value === "") return null;

  switch (type) {
    case "number": {
      const number = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
      return Number.isNaN(number) ? null : number;
    }
    case "boolean":
      return typeof value === "boolean"
        ? value
        : /^(true|yes|1)$/i.test(String(value).trim());
    case "list":
      return Array.isArray(value) ? value : [value];
    default:
      return typeof value === "object" ? JSON.stringify(value) : String(value);
  }
};

/**
 * Pulls named values out of free text with the connected model, like n8n's
 * Information Extractor: the result is at <name>.output.<attribute>.
 */
export const informationExtractorExecutor: NodeExecutor<
  InformationExtractorData
> = async ({ data, nodeId, userId, context, step, allNodes, connections }) => {
  const variableName = data.variableName?.trim() || "extracted";
  const attributes = parseAttributes(data.attributes);

  if (attributes.length === 0) {
    throw new NonRetriableError(
      "Information Extractor node: add at least one attribute"
    );
  }

  const text = renderTemplate(data.inputText, context).trim();
  if (!text) {
    throw new NonRetriableError("Information Extractor node: Text is empty");
  }

  const model = await loadConnectedModel({
    label: "Information Extractor",
    nodeId,
    userId,
    allNodes,
    connections,
    step,
  });

  const system = [
    renderTemplate(data.systemPrompt, context).trim() ||
      "You extract structured information from text. Only use what the text says; never guess.",
    "Extract these attributes:",
    ...attributes.map(
      (attribute) =>
        `- "${attribute.name}" (${attribute.type === "date" ? "date in ISO 8601 format" : attribute.type})${attribute.description ? `: ${attribute.description}` : ""}`
    ),
    "Use null for an attribute the text does not contain.",
    "Reply with only a JSON object whose keys are exactly the attribute names.",
  ].join("\n");

  try {
    const answer = await step.run(`information-extractor-${nodeId}`, async () => {
      const result = await generateText({
        model: model.create(),
        system,
        prompt: text,
      });

      return result.text;
    });

    const parsed = extractJson(answer);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new NonRetriableError(
        "Information Extractor node: the model did not answer with a JSON object"
      );
    }

    const output = Object.fromEntries(
      attributes.map((attribute) => [
        attribute.name,
        coerceAttribute(
          (parsed as Record<string, unknown>)[attribute.name],
          attribute.type
        ),
      ])
    );

    return {
      ...context,
      [variableName]: { output },
    };
  } catch (error) {
    throw toAiError("Information Extractor", error);
  }
};

// =========================================================================
// VECTOR STORE
// =========================================================================
type VectorStoreData = {
  variableName?: string;
  credentialId?: string;
  operation?: string;
  collection?: string;
  // "openai" | "gemini" | "compatible"
  embeddingProvider?: string;
  embeddingModel?: string;
  baseUrl?: string;
  text?: string;
  metadataJson?: string;
  chunkSize?: string;
  chunkOverlap?: string;
  query?: string;
  topK?: string;
};

export const DEFAULT_EMBEDDING_MODELS: Record<string, string> = {
  openai: "text-embedding-3-small",
  gemini: "gemini-embedding-001",
};

const MAX_CHUNKS_PER_INSERT = 200;
// Similarity is computed in the app, so a collection is read into memory
const MAX_DOCUMENTS_PER_SEARCH = 5000;
const MAX_TOP_K = 20;

const createEmbeddingModel = (data: VectorStoreData, apiKey: string): EmbeddingModel => {
  const provider = data.embeddingProvider || "openai";
  const modelName =
    data.embeddingModel?.trim() || DEFAULT_EMBEDDING_MODELS[provider];

  if (!modelName) {
    throw new NonRetriableError("Vector Store node: Embedding Model is required");
  }

  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey }).embedding(modelName);

    case "gemini":
      return createGoogleGenerativeAI({ apiKey }).embedding(modelName);

    case "compatible": {
      const baseURL = data.baseUrl?.trim().replace(/\/+$/, "");
      if (!baseURL) {
        throw new NonRetriableError("Vector Store node: Base URL is required");
      }

      return createOpenAI({
        apiKey,
        baseURL,
        // A URL typed in by the user gets the same guard as HTTP Request
        fetch: safeFetch as unknown as typeof fetch,
      }).embedding(modelName);
    }

    default:
      throw new NonRetriableError(
        `Vector Store node: Unsupported embedding provider "${provider}"`
      );
  }
};

/**
 * A simple document store for retrieval (RAG): text is split into chunks,
 * embedded and saved per user and collection; a search returns the chunks
 * closest in meaning to the query. Connected to an AI Agent's Tools port
 * with Search and {{$fromAI "query"}}, it lets the agent look things up.
 */
export const vectorStoreExecutor: NodeExecutor<VectorStoreData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
}) => {
  const variableName = data.variableName?.trim() || "vectorStore";
  const operation = data.operation || "search";
  const collection = renderTemplate(data.collection, context).trim() || "default";

  try {
    if (operation === "delete_collection") {
      const result = await step.run(`vector-store-${nodeId}-delete`, async () => {
        const deleted = await prisma.vectorDocument.deleteMany({
          where: { userId, collection },
        });

        return { collection, deleted: deleted.count };
      });

      return { ...context, [variableName]: result };
    }

    const apiKey = await loadCredentialSecret({
      step,
      stepId: `vector-store-${nodeId}-get-credential`,
      credentialId: data.credentialId,
      userId,
      label: "Vector Store",
    });

    if (operation === "insert") {
      const text = renderTemplate(data.text, context);
      const chunks = splitText(
        text,
        Number(renderTemplate(data.chunkSize, context)) || 1000,
        Number(renderTemplate(data.chunkOverlap, context)) || 100
      );

      if (chunks.length === 0) {
        throw new NonRetriableError("Vector Store node: Text is empty");
      }

      if (chunks.length > MAX_CHUNKS_PER_INSERT) {
        throw new NonRetriableError(
          `Vector Store node: the text makes ${chunks.length} chunks; the limit per run is ${MAX_CHUNKS_PER_INSERT}. Insert it in parts or use a larger chunk size.`
        );
      }

      const metadataText = renderTemplate(data.metadataJson, context).trim();
      const metadata = metadataText
        ? parseJsonField<Prisma.InputJsonValue>("Vector Store", "Metadata", metadataText)
        : undefined;

      const result = await step.run(`vector-store-${nodeId}-insert`, async () => {
        const { embeddings } = await embedMany({
          model: createEmbeddingModel(data, apiKey),
          values: chunks,
        });

        await prisma.vectorDocument.createMany({
          data: chunks.map((content, index) => ({
            userId,
            collection,
            content,
            metadata,
            embedding: embeddings[index],
          })),
        });

        return { collection, inserted: chunks.length };
      });

      return { ...context, [variableName]: result };
    }

    if (operation === "search") {
      const query = renderTemplate(data.query, context).trim();
      if (!query) {
        throw new NonRetriableError("Vector Store node: Query is empty");
      }

      const topK = Math.min(
        Math.max(Number(renderTemplate(data.topK, context)) || 4, 1),
        MAX_TOP_K
      );

      const result = await step.run(`vector-store-${nodeId}-search`, async () => {
        const { embedding } = await embed({
          model: createEmbeddingModel(data, apiKey),
          value: query,
        });

        const documents = await prisma.vectorDocument.findMany({
          where: { userId, collection },
          orderBy: { createdAt: "desc" },
          take: MAX_DOCUMENTS_PER_SEARCH,
        });

        const matches = documents
          // Chunks embedded with another model cannot be compared
          .filter((document) => document.embedding.length === embedding.length)
          .map((document) => ({
            content: document.content,
            metadata: document.metadata,
            score: cosineSimilarity(embedding, document.embedding),
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, topK);

        return {
          matches,
          count: matches.length,
          // Ready to drop into a prompt
          text: matches.map((match) => match.content).join("\n\n---\n\n"),
        };
      });

      return { ...context, [variableName]: result };
    }

    throw new NonRetriableError(
      `Vector Store node: Unsupported operation "${operation}"`
    );
  } catch (error) {
    throw toAiError("Vector Store", error);
  }
};
