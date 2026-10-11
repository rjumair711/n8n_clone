-- AlterEnum
ALTER TYPE "ExecutionStatus" ADD VALUE 'WAITING';

-- AlterEnum
ALTER TYPE "NodeType" ADD VALUE 'WAIT';

-- AlterTable
ALTER TABLE "Execution" ADD COLUMN     "waitingFor" TEXT,
ADD COLUMN     "waitingUntil" TIMESTAMP(3);
