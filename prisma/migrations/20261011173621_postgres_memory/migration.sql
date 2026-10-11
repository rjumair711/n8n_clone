-- AlterEnum
ALTER TYPE "NodeType" ADD VALUE 'POSTGRES_MEMORY';

-- CreateTable
CREATE TABLE "agent_memory_summary" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "summarizedUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_memory_summary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_fact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_fact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_memory_summary_nodeId_userId_sessionId_key" ON "agent_memory_summary"("nodeId", "userId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "contact_fact_userId_contactId_key_key" ON "contact_fact"("userId", "contactId", "key");

-- CreateIndex
CREATE INDEX "agent_memory_nodeId_userId_sessionId_createdAt_idx" ON "agent_memory"("nodeId", "userId", "sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "agent_memory_summary" ADD CONSTRAINT "agent_memory_summary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_fact" ADD CONSTRAINT "contact_fact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
