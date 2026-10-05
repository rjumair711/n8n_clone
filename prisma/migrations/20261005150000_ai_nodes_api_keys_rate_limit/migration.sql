-- AlterEnum
ALTER TYPE "NodeType" ADD VALUE IF NOT EXISTS 'GMAIL_TRIGGER';
ALTER TYPE "NodeType" ADD VALUE IF NOT EXISTS 'STRUCTURED_OUTPUT_PARSER';
ALTER TYPE "NodeType" ADD VALUE IF NOT EXISTS 'TEXT_CLASSIFIER';
ALTER TYPE "NodeType" ADD VALUE IF NOT EXISTS 'INFORMATION_EXTRACTOR';
ALTER TYPE "NodeType" ADD VALUE IF NOT EXISTS 'VECTOR_STORE';
ALTER TYPE "NodeType" ADD VALUE IF NOT EXISTS 'MCP_CLIENT_TOOL';

-- CreateTable
CREATE TABLE "TriggerState" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "state" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TriggerState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vector_document" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "collection" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "embedding" DOUBLE PRECISION[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vector_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_key" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "api_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "TriggerState_nodeId_key" ON "TriggerState"("nodeId");
CREATE INDEX "TriggerState_workflowId_idx" ON "TriggerState"("workflowId");
CREATE INDEX "vector_document_userId_collection_idx" ON "vector_document"("userId", "collection");
CREATE UNIQUE INDEX "api_key_keyHash_key" ON "api_key"("keyHash");
CREATE INDEX "api_key_userId_idx" ON "api_key"("userId");

-- AddForeignKey
ALTER TABLE "TriggerState" ADD CONSTRAINT "TriggerState_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Email verification is now required to sign in with a password. Accounts
-- that already exist were created before that rule, so they keep working.
UPDATE "user" SET "emailVerified" = true WHERE "emailVerified" = false;
