-- AlterTable
ALTER TABLE "ExecutionNode" ADD COLUMN     "dataSource" TEXT;

-- CreateTable
CREATE TABLE "pinned_data" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "executionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pinned_data_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pinned_data_workflowId_nodeId_key" ON "pinned_data"("workflowId", "nodeId");

-- AddForeignKey
ALTER TABLE "pinned_data" ADD CONSTRAINT "pinned_data_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
