-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NodeType" ADD VALUE 'DATA_TABLE';
ALTER TYPE "NodeType" ADD VALUE 'IMAGE_GENERATION';
ALTER TYPE "NodeType" ADD VALUE 'STICKY_NOTE';

-- AlterTable
ALTER TABLE "Workflow" ADD COLUMN     "folderId" TEXT;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "onboarding" JSONB;

-- CreateTable
CREATE TABLE "workflow_folder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_tag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_tag_link" (
    "workflowId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "workflow_tag_link_pkey" PRIMARY KEY ("workflowId","tagId")
);

-- CreateTable
CREATE TABLE "data_table" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_table_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_table_row" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_table_row_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workflow_folder_userId_name_key" ON "workflow_folder"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_tag_userId_name_key" ON "workflow_tag"("userId", "name");

-- CreateIndex
CREATE INDEX "workflow_tag_link_tagId_idx" ON "workflow_tag_link"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "data_table_userId_name_key" ON "data_table"("userId", "name");

-- CreateIndex
CREATE INDEX "data_table_row_tableId_updatedAt_idx" ON "data_table_row"("tableId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "data_table_row_tableId_key_key" ON "data_table_row"("tableId", "key");

-- CreateIndex
CREATE INDEX "Workflow_folderId_idx" ON "Workflow"("folderId");

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "workflow_folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_folder" ADD CONSTRAINT "workflow_folder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_tag" ADD CONSTRAINT "workflow_tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_tag_link" ADD CONSTRAINT "workflow_tag_link_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_tag_link" ADD CONSTRAINT "workflow_tag_link_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "workflow_tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_table" ADD CONSTRAINT "data_table_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_table_row" ADD CONSTRAINT "data_table_row_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "data_table"("id") ON DELETE CASCADE ON UPDATE CASCADE;
