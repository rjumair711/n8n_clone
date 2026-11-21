-- CreateTable
CREATE TABLE "managed_server" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "customerEmail" TEXT NOT NULL,
    "polarSubscriptionId" TEXT,
    "productId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "tokenHash" TEXT,
    "tokenPrefix" TEXT,
    "domain" TEXT,
    "version" TEXT,
    "installedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "lastBackupAt" TIMESTAMP(3),
    "health" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "managed_server_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "managed_server_polarSubscriptionId_key" ON "managed_server"("polarSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "managed_server_tokenHash_key" ON "managed_server"("tokenHash");

-- CreateIndex
CREATE INDEX "managed_server_userId_idx" ON "managed_server"("userId");

-- CreateIndex
CREATE INDEX "managed_server_customerEmail_idx" ON "managed_server"("customerEmail");

-- AddForeignKey
ALTER TABLE "managed_server" ADD CONSTRAINT "managed_server_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
