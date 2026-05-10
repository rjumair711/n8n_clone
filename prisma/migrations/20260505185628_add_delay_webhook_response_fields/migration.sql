-- AlterEnum
ALTER TYPE "NodeType" ADD VALUE 'WEBHOOK_RESPONSE';

-- AlterTable
ALTER TABLE "Node" ADD COLUMN     "delayAmount" INTEGER,
ADD COLUMN     "delayUnit" TEXT,
ADD COLUMN     "responseMessage" TEXT,
ADD COLUMN     "responseStatus" TEXT;
