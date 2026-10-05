-- AlterEnum
ALTER TYPE "NodeType" ADD VALUE IF NOT EXISTS 'GOOGLE_DRIVE';
ALTER TYPE "NodeType" ADD VALUE IF NOT EXISTS 'PDF_GENERATOR';
ALTER TYPE "NodeType" ADD VALUE IF NOT EXISTS 'CONVERT_TO_FILE';
ALTER TYPE "NodeType" ADD VALUE IF NOT EXISTS 'EXTRACT_FROM_FILE';

-- CreateTable
CREATE TABLE "workflow_file" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "executionId" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_file_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workflow_file_userId_idx" ON "workflow_file"("userId");
CREATE INDEX "workflow_file_createdAt_idx" ON "workflow_file"("createdAt");

-- AddForeignKey
ALTER TABLE "workflow_file" ADD CONSTRAINT "workflow_file_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
