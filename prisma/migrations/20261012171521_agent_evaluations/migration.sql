-- CreateTable
CREATE TABLE "eval_dataset" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "scorer" TEXT NOT NULL,
    "outputPath" TEXT NOT NULL DEFAULT '',
    "criteria" TEXT,
    "judgeModel" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eval_dataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eval_row" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "input" TEXT NOT NULL,
    "expected" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eval_row_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eval_run" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "scorer" TEXT NOT NULL,
    "workflowVersionNumber" INTEGER,
    "models" JSONB,
    "rowsTotal" INTEGER NOT NULL DEFAULT 0,
    "rowsDone" INTEGER NOT NULL DEFAULT 0,
    "rowsPassed" INTEGER NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION,
    "costUsd" DECIMAL(18,10),
    "judgeCostUsd" DECIMAL(18,10),
    "avgDurationMs" INTEGER,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "eval_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eval_result" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "rowId" TEXT,
    "position" INTEGER NOT NULL,
    "input" TEXT NOT NULL,
    "expected" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "output" TEXT,
    "score" DOUBLE PRECISION,
    "passed" BOOLEAN,
    "reason" TEXT,
    "error" TEXT,
    "executionId" TEXT,
    "durationMs" INTEGER,
    "costUsd" DECIMAL(18,10),
    "judgeCostUsd" DECIMAL(18,10),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eval_result_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "eval_dataset_workflowId_idx" ON "eval_dataset"("workflowId");

-- CreateIndex
CREATE INDEX "eval_row_datasetId_position_idx" ON "eval_row"("datasetId", "position");

-- CreateIndex
CREATE INDEX "eval_run_datasetId_startedAt_idx" ON "eval_run"("datasetId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "eval_result_runId_position_key" ON "eval_result"("runId", "position");

-- AddForeignKey
ALTER TABLE "eval_dataset" ADD CONSTRAINT "eval_dataset_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eval_row" ADD CONSTRAINT "eval_row_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "eval_dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eval_run" ADD CONSTRAINT "eval_run_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "eval_dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eval_result" ADD CONSTRAINT "eval_result_runId_fkey" FOREIGN KEY ("runId") REFERENCES "eval_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
