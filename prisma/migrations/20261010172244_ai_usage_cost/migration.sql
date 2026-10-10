-- AlterTable
ALTER TABLE "Workflow" ADD COLUMN     "aiBudgetCents" INTEGER;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "aiBudgetCents" INTEGER;

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workflowId" TEXT,
    "executionId" TEXT,
    "nodeId" TEXT,
    "nodeName" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'chat',
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(18,10),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_price" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputPerM" DECIMAL(12,6) NOT NULL,
    "outputPerM" DECIMAL(12,6) NOT NULL,
    "cachedInputPerM" DECIMAL(12,6),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_price_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_usage_userId_createdAt_idx" ON "ai_usage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_workflowId_createdAt_idx" ON "ai_usage"("workflowId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_executionId_idx" ON "ai_usage"("executionId");

-- CreateIndex
CREATE UNIQUE INDEX "model_price_provider_model_key" ON "model_price"("provider", "model");

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
