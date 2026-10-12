import { readCredentialValue } from "@/lib/external-secrets";
import { google } from "googleapis";
import { NonRetriableError } from "inngest";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { getGoogleAuthFromCredential } from "@/lib/google-oauth";
import { getAiUsageScope } from "@/lib/ai-usage";
import { removeMissingDocuments, findStoredDocument } from "@/lib/vector-search";
import type { NodeExecutor } from "@/features/executions/types";
import { renderTemplate } from "../../lib/templates";
import {
  loadCredentialSecret,
  parseJsonField,
  toIntegrationError,
} from "../../lib/integration";
import {
  LOADER_DEFAULT_DOCUMENTS,
  LOADER_MAX_DOCUMENTS,
} from "../../lib/rag-options";
import { parseDriveId } from "../files/executors";
import {
  checkEmbeddingSettings,
  hashDocument,
  prepareChunks,
  saveDocument,
  type EmbeddingSettings,
} from "./executors";
import {
  listDriveFolder,
  listNotionDatabase,
  parseNotionId,
  readDriveDocument,
  readNotionDocument,
  type DocumentText,
  type SourceDocument,
  type SourceListing,
} from "./document-sources";

// Document Loader: reads every document of a Google Drive folder or a
// Notion database into a Vector Store collection. A document that has not
// changed since the last run is skipped; one that has changed replaces its
// old chunks.

type DocumentLoaderData = EmbeddingSettings & {
  variableName?: string;
  // The source's credential: a Google account, or a Notion integration
  credentialId?: string;
  // "google_drive_folder" | "notion_database"
  operation?: string;
  folderId?: string;
  databaseId?: string;
  collection?: string;
  // The key of the embedding model
  embeddingCredentialId?: string;
  splitBy?: string;
  chunkSize?: string;
  chunkOverlap?: string;
  maxDocuments?: string;
  metadataJson?: string;
  // "true": also remove documents the source no longer has
  removeMissing?: string;
};

const LABEL = "Document Loader";

export const LOADER_SOURCES = ["google_drive_folder", "notion_database"] as const;

type LoaderSource = (typeof LOADER_SOURCES)[number];

// Notion is called with ky, whose errors carry the response; Google's
// client puts what went wrong in the message
const toLoaderError = async (error: any): Promise<NonRetriableError> => {
  if (error instanceof NonRetriableError) return error;

  if (typeof error?.response?.clone === "function") {
    return toIntegrationError(LABEL, error);
  }

  return new NonRetriableError(
    `${LABEL} node failed: ${error?.message || "unknown error"}`
  );
};

type DocumentReport = {
  id: string;
  title: string;
  // added | updated | unchanged | skipped | failed
  status: string;
  chunks: number;
  reason?: string;
};

export const resolveMaxDocuments = (value: unknown): number => {
  const count = Math.floor(Number(String(value ?? "").trim()));

  return Number.isFinite(count) && count >= 1
    ? Math.min(count, LOADER_MAX_DOCUMENTS)
    : LOADER_DEFAULT_DOCUMENTS;
};

/**
 * Where the documents come from, checked: the folder's or database's id,
 * and the prefix every document of that source gets in the store. The
 * prefix keeps two folders that feed one collection apart.
 */
export const resolveLoaderSource = (
  data: DocumentLoaderData,
  render: (value: string | undefined) => string
): { source: LoaderSource; containerId: string; prefix: string; name: string } => {
  const source = (data.operation || LOADER_SOURCES[0]) as LoaderSource;

  if (source === "google_drive_folder") {
    const folderId = parseDriveId(render(data.folderId));

    if (!folderId) {
      throw new NonRetriableError(`${LABEL} node: Folder is required`);
    }
    // It goes into Drive's search expression: an id and nothing else
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(folderId)) {
      throw new NonRetriableError(
        `${LABEL} node: Folder must be a Google Drive folder ID, or the folder's link`
      );
    }

    return { source, containerId: folderId, prefix: `gdrive:${folderId}:`, name: "google_drive" };
  }

  if (source === "notion_database") {
    const text = render(data.databaseId).trim();
    if (!text) {
      throw new NonRetriableError(`${LABEL} node: Database is required`);
    }

    const databaseId = parseNotionId(text);
    if (!databaseId) {
      throw new NonRetriableError(
        `${LABEL} node: Database must be a Notion database ID (32 letters and digits), or the database's link`
      );
    }

    return { source, containerId: databaseId, prefix: `notion:${databaseId}:`, name: "notion" };
  }

  throw new NonRetriableError(`${LABEL} node: Unsupported source "${String(source)}"`);
};

/**
 * Loads the documents of a Google Drive folder or a Notion database into a
 * Vector Store collection.
 */
export const documentLoaderExecutor: NodeExecutor<DocumentLoaderData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
  allNodes,
  executionId,
  workflowId,
}) => {
  const variableName = data.variableName?.trim() || "loader";
  const usageScope = getAiUsageScope({ userId, workflowId, executionId, nodeId, allNodes });
  const render = (value: string | undefined) => renderTemplate(value, context).trim();

  // Every check of the fields comes before a credential is read
  const location = resolveLoaderSource(data, render);
  const collection = render(data.collection) || "default";
  const maxDocuments = resolveMaxDocuments(render(data.maxDocuments));
  const split = {
    splitBy: data.splitBy,
    chunkSize: render(data.chunkSize),
    chunkOverlap: render(data.chunkOverlap),
  };
  const settings: EmbeddingSettings = {
    embeddingProvider: data.embeddingProvider,
    embeddingModel: data.embeddingModel,
    baseUrl: data.baseUrl,
  };

  checkEmbeddingSettings(LABEL, settings);

  const metadataText = render(data.metadataJson);
  const metadata = metadataText
    ? parseJsonField<unknown>(LABEL, "Metadata", metadataText)
    : {};

  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new NonRetriableError(`${LABEL} node: Metadata must be a JSON object`);
  }

  if (!data.credentialId) {
    throw new NonRetriableError(`${LABEL} node: Credential is required`);
  }
  if (!data.embeddingCredentialId) {
    throw new NonRetriableError(`${LABEL} node: Embeddings Credential is required`);
  }

  // Only the encrypted row passes through the step
  const sourceCredential = await step.run(`document-loader-${nodeId}-get-credential`, async () =>
    prisma.credential.findUnique({ where: { id: data.credentialId, userId } })
  );

  if (!sourceCredential) {
    throw new NonRetriableError(`${LABEL} node: Credential not found`);
  }

  const embeddingKey = await loadCredentialSecret({
    step,
    stepId: `document-loader-${nodeId}-get-embedding-credential`,
    credentialId: data.embeddingCredentialId,
    userId,
    label: LABEL,
  });

  // Made where they are used: nothing decrypted is kept in a step's result
  const openDrive = () =>
    google.drive({
      version: "v3",
      auth: getGoogleAuthFromCredential(LABEL, sourceCredential.value),
    });
  const notionToken = async () =>
    (await readCredentialValue(sourceCredential.value, userId)).trim();

  try {
    const listing: SourceListing = await step.run(`document-loader-${nodeId}-list`, async () =>
      location.source === "google_drive_folder"
        ? listDriveFolder({ drive: openDrive(), folderId: location.containerId, limit: maxDocuments })
        : listNotionDatabase({ token: await notionToken(), databaseId: location.containerId, limit: maxDocuments })
    );

    const reports: DocumentReport[] = [];

    // One step per document: a long folder is not one long call, and a run
    // that is retried does not read again what it already stored
    for (const document of listing.documents) {
      const report = await step.run(
        `document-loader-${nodeId}-doc-${document.id}`,
        async (): Promise<DocumentReport> => {
          const sourceId = `${location.prefix}${document.id}`;
          const base = { id: document.id, title: document.title };

          try {
            // The source says the document is as it was: nothing is read
            if (document.version) {
              const stored = await findStoredDocument(userId, collection, sourceId);

              if (stored?.sourceVersion === document.version) {
                return { ...base, status: "unchanged", chunks: 0 };
              }
            }

            const content: DocumentText =
              location.source === "google_drive_folder"
                ? await readDriveDocument(openDrive(), document)
                : await readNotionDocument(await notionToken(), document);

            if ("skip" in content) {
              return { ...base, status: "skipped", chunks: 0, reason: content.skip };
            }

            if (!content.text.trim()) {
              return { ...base, status: "skipped", chunks: 0, reason: "the document is empty" };
            }

            const documentMetadata = {
              ...(metadata as Record<string, Prisma.InputJsonValue>),
              source: location.name,
              title: document.title,
              ...(document.url ? { url: document.url } : {}),
            };

            const saved = await saveDocument({
              label: LABEL,
              settings,
              apiKey: embeddingKey,
              scope: usageScope,
              userId,
              collection,
              chunks: prepareChunks(LABEL, content.text, split),
              metadata: documentMetadata,
              extraMetadata: { documentId: sourceId },
              source: {
                id: sourceId,
                hash: hashDocument(content.text, { ...settings, ...split }, documentMetadata),
                version: document.version,
              },
            });

            return { ...base, status: saved.status, chunks: saved.inserted };
          } catch (error) {
            // One document that cannot be read does not stop the others
            const failure = await toLoaderError(error);

            return {
              ...base,
              status: "failed",
              chunks: 0,
              reason: failure.message.replace(/^Document Loader (node: |node failed: |API error )/, ""),
            };
          }
        }
      );

      reports.push(report);
    }

    // Only when the whole source was listed: a cut-off list says nothing
    // about what is gone
    const removed =
      data.removeMissing === "true" && !listing.truncated
        ? await step.run(`document-loader-${nodeId}-remove-missing`, async () =>
            removeMissingDocuments({
              userId,
              collection,
              prefix: location.prefix,
              keep: listing.documents.map((document) => `${location.prefix}${document.id}`),
            })
          )
        : 0;

    const count = (status: string) =>
      reports.filter((report) => report.status === status).length;

    return {
      ...context,
      [variableName]: {
        collection,
        source: location.name,
        found: listing.documents.length,
        added: count("added"),
        updated: count("updated"),
        unchanged: count("unchanged"),
        skipped: count("skipped"),
        failed: count("failed"),
        // Chunks of documents the source no longer has
        removed,
        chunks: reports.reduce((total, report) => total + report.chunks, 0),
        // The source has more documents than Max Documents
        truncated: listing.truncated,
        documents: reports,
      },
    };
  } catch (error) {
    throw await toLoaderError(error);
  }
};
