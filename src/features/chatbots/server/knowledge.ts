import "server-only";

import { createHash } from "crypto";
import { TRPCError } from "@trpc/server";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { BlockedRequestError } from "@/lib/ssrf";
import { removeMissingDocuments } from "@/lib/vector-search";
import { getAccountAiBudgetProblem } from "@/lib/ai-usage";
import {
  MAX_CHUNKS_PER_INSERT,
  checkEmbeddingSettings,
  saveDocument,
} from "@/features/executions/components/ai/executors";
import { readPageBuiltin } from "@/features/executions/components/apps/web";
import { extractDocxText, extractPdfText } from "@/features/executions/lib/file-readers";
import { splitDocument } from "@/features/executions/lib/text-splitter";
import {
  CHATBOT_MAX_FILE_BYTES,
  CHATBOT_MAX_SOURCES,
  CHATBOT_MAX_SOURCE_CHARACTERS,
  CHATBOT_USAGE_NAME,
  getChatbotFileKind,
  readSourceId,
  splitIntoParts,
  toSourceId,
  toSourcePartId,
  type ChatbotParts,
  type ChatbotSourceKind,
} from "../lib/chatbot";

// The knowledge base of a chatbot: documents and web pages, read into text,
// cut into chunks, embedded with the Vector Store node's own settings and
// credential, and saved in its collection. The agent's Vector Store node
// searches the same collection.

type Store = NonNullable<ChatbotParts["store"]>;

const LABEL = "Chatbot";

const refuse = (message: string): never => {
  throw new TRPCError({ code: "BAD_REQUEST", message });
};

// "Read Web Page node: the page answered 404" as "the page answered 404"
const withoutNodeName = (message: string) => message.replace(/^[A-Za-z /]+ node( failed)?: /, "");

const megabytes = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

export type SourceText = {
  kind: ChatbotSourceKind;
  // The file's name, or the page's address
  name: string;
  text: string;
  // Has headings to split by
  markdown: boolean;
  title?: string;
};

/**
 * The text of an uploaded document: a PDF, a Word file, or plain text.
 */
export const readFileSource = async (fileName: string, bytes: Buffer): Promise<SourceText> => {
  // "#" separates a document's name from the number of its part
  const name = fileName.trim().replace(/[\\/#]/g, "_").slice(0, 150);
  const kind = getChatbotFileKind(name);

  if (!kind) {
    return refuse(`"${name}" cannot be read. Upload a PDF, a Word file (.docx), or a text file (.txt, .md, .csv).`);
  }

  if (bytes.length === 0) return refuse(`"${name}" is empty.`);

  if (bytes.length > CHATBOT_MAX_FILE_BYTES) {
    return refuse(`"${name}" is larger than ${megabytes(CHATBOT_MAX_FILE_BYTES)}.`);
  }

  try {
    if (kind === "pdf") {
      const pdf = await extractPdfText(new Uint8Array(bytes));

      if (!pdf.text.trim()) {
        return refuse(`"${name}" has no text: it is probably a scan. Upload a PDF with text in it.`);
      }

      return { kind: "file", name, text: pdf.text, markdown: false };
    }

    if (kind === "docx") {
      return { kind: "file", name, text: (await extractDocxText(bytes)).text, markdown: false };
    }

    return { kind: "file", name, text: bytes.toString("utf8"), markdown: kind === "markdown" };
  } catch (error) {
    if (error instanceof TRPCError) throw error;

    return refuse(
      `"${name}" could not be read (${withoutNodeName(error instanceof Error ? error.message : "unknown error")}).`
    );
  }
};

/**
 * The main content of one web page. The address is fetched through the same
 * guard as the Read Web Page node: nothing inside the server's network.
 */
export const readUrlSource = async (url: string): Promise<SourceText> => {
  try {
    const page = await readPageBuiltin(url, "markdown");

    if (!page.content.trim()) {
      return refuse(`${url} has no text to read. A page that builds its content with JavaScript cannot be read here.`);
    }

    return {
      kind: "url",
      name: url,
      text: page.title ? `# ${page.title}\n\n${page.content}` : page.content,
      markdown: true,
      title: page.title,
    };
  } catch (error) {
    if (error instanceof TRPCError) throw error;

    return refuse(
      error instanceof BlockedRequestError
        ? `${url} cannot be read: ${error.message}`
        : `${url} could not be read (${withoutNodeName(error instanceof Error ? error.message : "unknown error")}).`
    );
  }
};

// The key of the Vector Store node's credential. Only ever the user's own.
const loadEmbeddingKey = async (userId: string, store: Store) => {
  const credential = store.credentialId
    ? await prisma.credential.findFirst({
        where: { id: store.credentialId, userId },
        select: { value: true },
      })
    : null;

  if (!credential) {
    return refuse(
      "The chatbot's Vector Store node has no embeddings credential. Open the workflow in the editor and pick one on the node."
    );
  }

  return decrypt(credential.value).trim();
};

/**
 * The documents and pages of a collection that were added by the chatbot
 * page, newest first.
 */
export const listSources = async (userId: string, collection: string) => {
  const groups = await prisma.vectorDocument.groupBy({
    by: ["sourceId"],
    where: { userId, collection, sourceId: { not: null } },
    _count: { _all: true },
    _max: { createdAt: true },
  });

  const sources = new Map<
    string,
    { id: string; kind: ChatbotSourceKind; name: string; chunks: number; addedAt: Date }
  >();

  for (const group of groups) {
    const source = readSourceId(group.sourceId);
    if (!source) continue;

    const addedAt = group._max.createdAt ?? new Date(0);
    const known = sources.get(source.id);

    sources.set(source.id, {
      ...source,
      chunks: (known?.chunks ?? 0) + group._count._all,
      addedAt: known && known.addedAt > addedAt ? known.addedAt : addedAt,
    });
  }

  return [...sources.values()].sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime());
};

/**
 * Adds one document or page to a chatbot's knowledge base, or replaces it
 * when it is already there. Adding the same text again embeds nothing.
 */
export const addSource = async ({
  userId,
  store,
  source,
}: {
  userId: string;
  store: Store;
  source: SourceText;
}) => {
  if (/\{\{/.test(store.collection)) {
    return refuse(
      "The chatbot's Vector Store node has an expression as its Collection, so documents cannot be added from this page."
    );
  }

  try {
    checkEmbeddingSettings(LABEL, store.settings);
  } catch (error) {
    return refuse(`The chatbot's Vector Store node is not set up: ${withoutNodeName((error as Error).message)}.`);
  }

  const sourceId = toSourceId(source.kind, source.name);
  const known = await listSources(userId, store.collection);

  if (known.length >= CHATBOT_MAX_SOURCES && !known.some((entry) => entry.id === sourceId)) {
    return refuse(`A chatbot can have up to ${CHATBOT_MAX_SOURCES} documents and pages. Remove one first.`);
  }

  const text = source.text.replace(/\r\n/g, "\n").trim();
  const truncated = text.length > CHATBOT_MAX_SOURCE_CHARACTERS;
  const chunks = splitDocument(text.slice(0, CHATBOT_MAX_SOURCE_CHARACTERS), {
    mode: source.markdown ? "markdown" : "characters",
  });

  if (chunks.length === 0) return refuse(`"${source.name}" has no text.`);

  // Before the key is read and anything is paid for
  const budgetProblem = await getAccountAiBudgetProblem(userId);
  if (budgetProblem) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: budgetProblem });
  }

  const apiKey = await loadEmbeddingKey(userId, store);
  const parts = splitIntoParts(chunks, MAX_CHUNKS_PER_INSERT);
  const metadata = {
    source: source.name,
    kind: source.kind,
    ...(source.title ? { title: source.title } : {}),
  };

  let embedded = 0;

  try {
    for (const [index, part] of parts.entries()) {
      const saved = await saveDocument({
        label: LABEL,
        settings: store.settings,
        apiKey,
        scope: { userId },
        usageName: CHATBOT_USAGE_NAME,
        userId,
        collection: store.collection,
        chunks: part,
        metadata,
        source: {
          id: toSourcePartId(sourceId, index),
          // Of the part's text and of what decides how it is embedded
          hash: createHash("sha256")
            .update(
              JSON.stringify([
                store.settings.embeddingProvider,
                store.settings.embeddingModel,
                store.settings.baseUrl,
                part.map((chunk) => chunk.content),
              ]),
              "utf8"
            )
            .digest("hex"),
        },
      });

      embedded += saved.inserted;
    }
  } catch (error) {
    // The provider's answer, without the key should it be repeated in it
    const raw = error instanceof Error ? error.message : "unknown error";
    const message = (apiKey ? raw.split(apiKey).join("[key]") : raw).slice(0, 300);

    return refuse(`"${source.name}" could not be embedded: ${withoutNodeName(message)}`);
  }

  // A document that got shorter has fewer parts than before
  await removeMissingDocuments({
    userId,
    collection: store.collection,
    prefix: `${sourceId}#`,
    keep: parts.map((_, index) => toSourcePartId(sourceId, index)),
  });

  return {
    id: sourceId,
    name: source.name,
    kind: source.kind,
    chunks: chunks.length,
    // False: the same text was already there
    changed: embedded > 0,
    truncated,
  };
};

export const removeSource = async (userId: string, collection: string, sourceId: string) => {
  // Only what the chatbot page added
  if (!readSourceId(sourceId)) return 0;

  const deleted = await prisma.vectorDocument.deleteMany({
    where: { userId, collection, sourceId: { startsWith: `${sourceId}#` } },
  });

  return deleted.count;
};
