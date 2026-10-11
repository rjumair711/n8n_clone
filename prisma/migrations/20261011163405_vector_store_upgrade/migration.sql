-- AlterEnum
ALTER TYPE "CredentialType" ADD VALUE 'COHERE';

-- AlterEnum
ALTER TYPE "NodeType" ADD VALUE 'DOCUMENT_LOADER';

-- AlterTable
-- Where a chunk came from, a hash of its document, and the source's own
-- version of it: how the Document Loader skips unchanged documents.
ALTER TABLE "vector_document" ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceVersion" TEXT;

-- CreateIndex
CREATE INDEX "vector_document_userId_collection_sourceId_idx" ON "vector_document"("userId", "collection", "sourceId");

-- pgvector, where the database has it.
--
-- "embeddingVector" holds the same numbers as "embedding", as a pgvector
-- value. It has no fixed number of dimensions, because collections are
-- embedded with different models; the indexes are therefore one per common
-- size, each on the rows of that size only. 3072 dimensions are more than
-- an HNSW index on "vector" takes (2000), so that one is on half-precision
-- values.
--
-- All of it is one block: if any statement fails (no permission to create
-- the extension, an older pgvector without halfvec), nothing of the block
-- stays, a warning is written, and the migration still succeeds. The app
-- looks for the column when it searches and compares embeddings itself
-- when it is not there. No existing row is changed here: the app fills the
-- column per collection (src/lib/vector-search.ts).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    RAISE NOTICE 'The pgvector extension is not available. The Vector Store keeps comparing embeddings in the app.';
    RETURN;
  END IF;

  CREATE EXTENSION IF NOT EXISTS vector;

  ALTER TABLE "vector_document" ADD COLUMN IF NOT EXISTS "embeddingVector" vector;

  CREATE INDEX IF NOT EXISTS "vector_document_embedding_768_idx" ON "vector_document"
    USING hnsw (("embeddingVector"::vector(768)) vector_cosine_ops)
    WHERE (vector_dims("embeddingVector") = 768);

  CREATE INDEX IF NOT EXISTS "vector_document_embedding_1024_idx" ON "vector_document"
    USING hnsw (("embeddingVector"::vector(1024)) vector_cosine_ops)
    WHERE (vector_dims("embeddingVector") = 1024);

  CREATE INDEX IF NOT EXISTS "vector_document_embedding_1536_idx" ON "vector_document"
    USING hnsw (("embeddingVector"::vector(1536)) vector_cosine_ops)
    WHERE (vector_dims("embeddingVector") = 1536);

  CREATE INDEX IF NOT EXISTS "vector_document_embedding_3072_idx" ON "vector_document"
    USING hnsw (("embeddingVector"::halfvec(3072)) halfvec_cosine_ops)
    WHERE (vector_dims("embeddingVector") = 3072);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'pgvector was not set up (%). The Vector Store keeps comparing embeddings in the app.', SQLERRM;
END
$$;
