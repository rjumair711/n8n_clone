-- CreateTable
CREATE TABLE "support_message" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "workflowId" TEXT,
    "workflowName" TEXT,
    "nodeId" TEXT,
    "nodeName" TEXT,
    "nodeType" TEXT,
    "page" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_reply" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "adminId" TEXT,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_reply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_message_userId_createdAt_idx" ON "support_message"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "support_message_status_createdAt_idx" ON "support_message"("status", "createdAt");

-- CreateIndex
CREATE INDEX "support_reply_messageId_createdAt_idx" ON "support_reply"("messageId", "createdAt");

-- AddForeignKey
ALTER TABLE "support_message" ADD CONSTRAINT "support_message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_reply" ADD CONSTRAINT "support_reply_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "support_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_reply" ADD CONSTRAINT "support_reply_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
