-- AlterTable
ALTER TABLE "Execution" ADD COLUMN     "workflowVersionId" TEXT,
ADD COLUMN     "workflowVersionNumber" INTEGER;

-- CreateTable
CREATE TABLE "workflow_version" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "nodes" JSONB NOT NULL,
    "connections" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "restoredFromNumber" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_version_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workflow_version_workflowId_createdAt_idx" ON "workflow_version"("workflowId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_version_workflowId_number_key" ON "workflow_version"("workflowId", "number");

-- AddForeignKey
ALTER TABLE "workflow_version" ADD CONSTRAINT "workflow_version_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
