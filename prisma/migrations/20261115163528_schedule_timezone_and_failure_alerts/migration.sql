-- AlterTable
ALTER TABLE "Workflow" ADD COLUMN     "timezone" TEXT;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "failureAlertEmails" BOOLEAN NOT NULL DEFAULT true;
