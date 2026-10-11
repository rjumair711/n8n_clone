-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CredentialType" ADD VALUE 'FACEBOOK_PAGE';
ALTER TYPE "CredentialType" ADD VALUE 'INSTAGRAM';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NodeType" ADD VALUE 'MESSENGER';
ALTER TYPE "NodeType" ADD VALUE 'MESSENGER_TRIGGER';
ALTER TYPE "NodeType" ADD VALUE 'INSTAGRAM';
ALTER TYPE "NodeType" ADD VALUE 'INSTAGRAM_TRIGGER';
ALTER TYPE "NodeType" ADD VALUE 'SOCIAL_POST';
