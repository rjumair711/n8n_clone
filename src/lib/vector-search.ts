import "server-only";

import { Prisma } from "@prisma/client";
import { cosineSimilarity } from "ai";
import prisma from "./db";

// Where the Vector Store keeps and compares embeddings.
//
// Every chunk has its embedding in "embedding" (a plain array of numbers),
// which is what the store always had. When the database has the pgvector
// extension, the same numbers are also kept in "embeddingVector" (a pgvector
// value) and searches are answered by the database. Without it, or when a
// pgvector query fails for any reason, the chunks of the collection are
// read and compared here in the app, as before. The array is always
// written, so either way works on every row.

export type StoredMatch = {
  id: string;
  content: string;
  metadata: unknown;
  // Cosine similarity: 1 is the same direction
  score: number;
};

export type SearchEngine = "pgvector" | "pgvector-index" | "app";

// Comparing in the app reads the collection into memory
export const MAX_DOCUMENTS_IN_APP = 5000;

// pgvector: up to this many chunks, a collection is compared exactly (every
// chunk, in the database). Above it the approximate index is used.
export const EXACT_SEARCH_MAX_CHUNKS = 10_000;

// The dimensions the migration made an index for, and the type each index
// is on. An HNSW index on "vector" takes at most 2000 dimensions, so the
// 3072 of the large models are indexed as half-precision values.
export const INDEXED_DIMENSIONS: Record<number, "vector" | "halfvec"> = {
  768: "vector",
  1024: "vector",
  1536: "vector",
  3072: "halfvec",
};

// The most dimensions a pgvector "vector" value can have
const MAX_VECTOR_DIMENSIONS = 16_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

// =========================================================================
// METADATA FILTERS
// =========================================================================
/**
 * Whether stored metadata contains the filter, the way Postgres' jsonb
 * `@>` decides it: every key of the filter is there with the same value,
 * nested objects are compared the same way, and a list in the filter needs
 * each of its entries somewhere in the stored list.
 */
export const matchesMetadata = (metadata: unknown, filter: unknown): boolean => {
  if (isRecord(filter)) {
    if (!isRecord(metadata)) return false;

    return Object.entries(filter).every(
      ([key, value]) => key in metadata && matchesMetadata(metadata[key], value)
    );
  }

  if (Array.isArray(filter)) {
    if (!Array.isArray(metadata)) return false;

    return filter.every((wanted) => metadata.some((entry) => matchesMetadata(entry, wanted)));
  }

  return metadata === filter;
};

// =========================================================================
// PGVECTOR
// =========================================================================
/**
 * An embedding as the text pgvector reads: "[0.1,0.2,...]". Only finite
 * numbers get in, so the text can hold nothing else.
 */
export const toVectorLiteral = (embedding: number[]): string => {
  if (embedding.length === 0 || embedding.length > MAX_VECTOR_DIMENSIONS) {
    throw new Error(`An embedding of ${embedding.length} dimensions cannot be stored as a vector`);
  }

  if (!embedding.every((value) => typeof value === "number" && Number.isFinite(value))) {
    throw new Error("The embedding has a value that is not a number");
  }

  return `[${embedding.join(",")}]`;
};

/**
 * The search statement.
 *
 *   exact     compares every chunk of the collection. The order expression
 *             is the bare column, which no index is on, so the database
 *             finds the collection's rows by its ordinary index and sorts.
 *   indexed   orders by the same cast expression the HNSW index of this
 *             dimension is built on, so the index can answer.
 *
 * The dimension goes into the statement as a number from
 * INDEXED_DIMENSIONS or from the embedding's own length; everything that
 * comes from a user is a parameter.
 */
export const buildVectorSearchSql = ({
  userId,
  collection,
  embedding,
  limit,
  filter,
  indexed = false,
}: {
  userId: string;
  collection: string;
  embedding: number[];
  limit: number;
  filter?: Record<string, unknown> | null;
  indexed?: boolean;
}): Prisma.Sql => {
  const vector = toVectorLiteral(embedding);
  const dimensions = Prisma.raw(String(embedding.length));
  const indexType = INDEXED_DIMENSIONS[embedding.length];

  if (indexed && !indexType) {
    throw new Error(`There is no vector index for ${embedding.length} dimensions`);
  }

  const distance = indexed
    ? Prisma.sql`("embeddingVector"::${Prisma.raw(indexType)}(${dimensions})) <=> ${vector}::${Prisma.raw(indexType)}(${dimensions})`
    : Prisma.sql`"embeddingVector" <=> ${vector}::vector`;

  const metadataFilter =
    filter && Object.keys(filter).length > 0
      ? Prisma.sql`AND "metadata" @> ${JSON.stringify(filter)}::jsonb`
      : Prisma.empty;

  return Prisma.sql`
    SELECT "id", "content", "metadata", 1 - (${distance}) AS "score"
    FROM "vector_document"
    WHERE "userId" = ${userId}
      AND "collection" = ${collection}
      AND "embeddingVector" IS NOT NULL
      AND vector_dims("embeddingVector") = ${dimensions}
      ${metadataFilter}
    ORDER BY ${distance}
    LIMIT ${Math.floor(limit)}`;
};

type PgvectorState = {
  // Null: the extension is not installed, or the column was not made
  version: string | null;
  // 0.8 and later can keep reading an index until enough rows pass the
  // WHERE clause, which a search inside one collection needs
  iterativeScan: boolean;
};

const UNAVAILABLE: PgvectorState = { version: null, iterativeScan: false };

// Looked up again after this long while pgvector is not there: it appears
// when the migration has run
const RECHECK_MS = 5 * 60 * 1000;

let cachedState: { state: PgvectorState; at: number } | null = null;

export const readPgvectorVersion = (version: unknown): PgvectorState => {
  const match = /^(\d+)\.(\d+)/.exec(typeof version === "string" ? version : "");
  if (!match) return UNAVAILABLE;

  const [major, minor] = [Number(match[1]), Number(match[2])];

  return {
    version: version as string,
    iterativeScan: major > 0 || minor >= 8,
  };
};

/**
 * Whether searches can be answered by pgvector. VECTOR_STORE_ENGINE=app
 * switches it off, for a database where it misbehaves.
 */
export const getPgvectorState = async (now: number = Date.now()): Promise<PgvectorState> => {
  if ((process.env.VECTOR_STORE_ENGINE || "").trim().toLowerCase() === "app") {
    return UNAVAILABLE;
  }

  if (cachedState && (cachedState.state.version || now - cachedState.at < RECHECK_MS)) {
    return cachedState.state;
  }

  let state = UNAVAILABLE;

  try {
    const [row] = await prisma.$queryRaw<{ version: string | null; hasColumn: boolean }[]>`
      SELECT
        (SELECT "extversion" FROM pg_extension WHERE "extname" = 'vector') AS "version",
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE "table_schema" = current_schema()
            AND "table_name" = 'vector_document'
            AND "column_name" = 'embeddingVector'
        ) AS "hasColumn"`;

    if (row?.hasColumn) state = readPgvectorVersion(row.version);
  } catch {
    // Not a Postgres that can be asked: the app compares
  }

  cachedState = { state, at: now };

  return state;
};

// For the tests
export const resetPgvectorState = () => {
  cachedState = null;
};

const describeDatabaseError = (error: unknown) =>
  // The code only: a message could repeat part of the statement
  String(
    (error as { code?: unknown })?.code ??
      (error as { meta?: { code?: unknown } })?.meta?.code ??
      (error as { name?: unknown })?.name ??
      "error"
  );

/**
 * Fills "embeddingVector" for the collection's chunks that do not have it:
 * the ones just inserted (the ORM cannot write that column), and any that
 * were saved before pgvector was there. Safe to run again: it only touches
 * rows where the vector is missing.
 */
export const syncCollectionVectors = async (userId: string, collection: string) => {
  const state = await getPgvectorState();
  if (!state.version) return false;

  try {
    await prisma.$executeRaw`
      UPDATE "vector_document"
      SET "embeddingVector" = "embedding"::vector
      WHERE "userId" = ${userId}
        AND "collection" = ${collection}
        AND "embeddingVector" IS NULL
        AND cardinality("embedding") BETWEEN 1 AND ${MAX_VECTOR_DIMENSIONS}`;

    return true;
  } catch (error) {
    console.warn(
      `[vector store] the pgvector column could not be filled (${describeDatabaseError(error)}); searches compare in the app`
    );

    return false;
  }
};

const searchInApp = async ({
  userId,
  collection,
  embedding,
  limit,
  filter,
}: SearchInput): Promise<StoredMatch[]> => {
  const documents = await prisma.vectorDocument.findMany({
    where: { userId, collection },
    orderBy: { createdAt: "desc" },
    take: MAX_DOCUMENTS_IN_APP,
    select: { id: true, content: true, metadata: true, embedding: true },
  });

  return rankInApp(documents, embedding, limit, filter);
};

/**
 * The in-app comparison: cosine similarity against every chunk that was
 * embedded with a model of the same size and passes the filter.
 */
export const rankInApp = (
  documents: { id: string; content: string; metadata: unknown; embedding: number[] }[],
  embedding: number[],
  limit: number,
  filter?: Record<string, unknown> | null
): StoredMatch[] =>
  documents
    // Chunks embedded with another model cannot be compared
    .filter((document) => document.embedding.length === embedding.length)
    .filter(
      (document) =>
        !filter || Object.keys(filter).length === 0 || matchesMetadata(document.metadata, filter)
    )
    .map((document) => ({
      id: document.id,
      content: document.content,
      metadata: document.metadata,
      score: cosineSimilarity(embedding, document.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

type SearchInput = {
  userId: string;
  collection: string;
  embedding: number[];
  limit: number;
  filter?: Record<string, unknown> | null;
};

const toMatches = (rows: StoredMatch[]): StoredMatch[] =>
  rows.map((row) => ({
    id: row.id,
    content: row.content,
    metadata: row.metadata,
    score: Number(row.score),
  }));

/**
 * The chunks of a collection closest to the embedding, best first, and
 * which engine found them.
 */
export const searchCollection = async (
  input: SearchInput
): Promise<{ matches: StoredMatch[]; engine: SearchEngine }> => {
  const state = await getPgvectorState();

  if (state.version && (await syncCollectionVectors(input.userId, input.collection))) {
    try {
      const useIndex =
        state.iterativeScan &&
        input.embedding.length in INDEXED_DIMENSIONS &&
        (await prisma.vectorDocument.count({
          where: { userId: input.userId, collection: input.collection },
        })) > EXACT_SEARCH_MAX_CHUNKS;

      if (useIndex) {
        const [, rows] = await prisma.$transaction([
          // Keep reading the index until enough chunks of this collection
          // (and filter) were found, in exact order of distance
          prisma.$executeRawUnsafe("SET LOCAL hnsw.iterative_scan = strict_order"),
          prisma.$queryRaw<StoredMatch[]>(buildVectorSearchSql({ ...input, indexed: true })),
        ]);

        // An index scan gives up after a number of rows. Fewer results
        // than asked for may mean that: the exact search settles it.
        if (rows.length >= input.limit) {
          return { matches: toMatches(rows), engine: "pgvector-index" };
        }
      }

      const rows = await prisma.$queryRaw<StoredMatch[]>(buildVectorSearchSql(input));

      return { matches: toMatches(rows), engine: "pgvector" };
    } catch (error) {
      console.warn(
        `[vector store] the pgvector search failed (${describeDatabaseError(error)}); comparing in the app`
      );
    }
  }

  return { matches: await searchInApp(input), engine: "app" };
};

// =========================================================================
// STORING
// =========================================================================
export type ChunkToStore = {
  content: string;
  metadata?: Prisma.InputJsonValue;
  embedding: number[];
};

// What says where a chunk came from, so the same document is not embedded
// again while it has not changed
export type DocumentSource = {
  // "gdrive:<file id>", "notion:<page id>", or the Document ID of an Insert
  id: string;
  // Of the text and of everything that decides how it is cut and embedded
  hash: string;
  // What the source says about the document's state: a modified time
  version?: string | null;
};

/**
 * The hash and version stored for a document, or null when the collection
 * does not have it.
 */
export const findStoredDocument = async (
  userId: string,
  collection: string,
  sourceId: string
) =>
  prisma.vectorDocument.findFirst({
    where: { userId, collection, sourceId },
    select: { contentHash: true, sourceVersion: true },
  });

/**
 * Notes the source's new version on a document whose text is unchanged, so
 * the next run does not have to read it again.
 */
export const touchStoredDocument = async (
  userId: string,
  collection: string,
  sourceId: string,
  version: string | null
) =>
  prisma.vectorDocument.updateMany({
    where: { userId, collection, sourceId },
    data: { sourceVersion: version },
  });

/**
 * Saves chunks. With a `source`, the chunks the collection already has for
 * that document are replaced, in one transaction: a search never sees half
 * of the old document next to half of the new one.
 */
export const storeChunks = async ({
  userId,
  collection,
  chunks,
  source,
}: {
  userId: string;
  collection: string;
  chunks: ChunkToStore[];
  source?: DocumentSource;
}) => {
  const rows = chunks.map((chunk) => ({
    userId,
    collection,
    content: chunk.content,
    metadata: chunk.metadata,
    embedding: chunk.embedding,
    ...(source
      ? {
          sourceId: source.id,
          contentHash: source.hash,
          sourceVersion: source.version ?? null,
        }
      : {}),
  }));

  let replaced = 0;

  if (source) {
    const [deleted] = await prisma.$transaction([
      prisma.vectorDocument.deleteMany({
        where: { userId, collection, sourceId: source.id },
      }),
      prisma.vectorDocument.createMany({ data: rows }),
    ]);

    replaced = deleted.count;
  } else {
    await prisma.vectorDocument.createMany({ data: rows });
  }

  await syncCollectionVectors(userId, collection);

  return { inserted: rows.length, replaced };
};

/**
 * Removes the chunks of documents a source no longer has. `keep` is every
 * document id the source listed; only chunks that came from that source
 * (their id starts with `prefix`) are considered.
 */
export const removeMissingDocuments = async ({
  userId,
  collection,
  prefix,
  keep,
}: {
  userId: string;
  collection: string;
  prefix: string;
  keep: string[];
}) => {
  const deleted = await prisma.vectorDocument.deleteMany({
    where: {
      userId,
      collection,
      sourceId: { startsWith: prefix, notIn: keep },
    },
  });

  return deleted.count;
};
