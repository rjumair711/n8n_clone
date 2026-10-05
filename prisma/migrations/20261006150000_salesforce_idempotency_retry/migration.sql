-- AlterEnum
ALTER TYPE "NodeType" ADD VALUE IF NOT EXISTS 'SALESFORCE';
ALTER TYPE "CredentialType" ADD VALUE IF NOT EXISTS 'SALESFORCE';

-- What an execution started with, so it can be retried
ALTER TABLE "Execution" ADD COLUMN "trigger" TEXT;
ALTER TABLE "Execution" ADD COLUMN "inputData" JSONB;

-- CreateTable
CREATE TABLE "webhook_delivery" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "executionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_delivery_workflowId_source_key_key" ON "webhook_delivery"("workflowId", "source", "key");
CREATE INDEX "webhook_delivery_createdAt_idx" ON "webhook_delivery"("createdAt");
