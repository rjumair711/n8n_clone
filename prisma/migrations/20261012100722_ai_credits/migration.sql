-- AlterTable
ALTER TABLE "ai_usage" ADD COLUMN     "included" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "aiCreditBalanceUsd" DECIMAL(18,10) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "platform_ai_provider" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "models" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_ai_provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_credit_purchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "polarOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "amountUsd" DECIMAL(18,10) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_credit_purchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_ai_provider_provider_key" ON "platform_ai_provider"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "ai_credit_purchase_polarOrderId_key" ON "ai_credit_purchase"("polarOrderId");

-- CreateIndex
CREATE INDEX "ai_credit_purchase_userId_createdAt_idx" ON "ai_credit_purchase"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ai_credit_purchase" ADD CONSTRAINT "ai_credit_purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
