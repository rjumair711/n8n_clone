-- AlterTable: "Execution data retention" (7, 30 or 90 days)
ALTER TABLE "user" ADD COLUMN "executionRetentionDays" INTEGER NOT NULL DEFAULT 30;

-- AlterTable: false for "Don't save node input/output"
ALTER TABLE "Workflow" ADD COLUMN "saveExecutionData" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: set when the retention cleanup removed an execution's data
ALTER TABLE "Execution" ADD COLUMN "dataDeletedAt" TIMESTAMP(3);
