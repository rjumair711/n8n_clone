-- AlterTable
ALTER TABLE "api_key" ADD COLUMN "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "expiresAt" TIMESTAMP(3);

-- Keys made before scopes existed could call every route: give them every
-- scope so they keep working. They have no expiry date.
--
-- Nothing to do for the keys themselves: this table has only ever held the
-- SHA-256 hash ("keyHash") and the visible prefix, never the key.
UPDATE "api_key"
SET "scopes" = ARRAY['workflows:read', 'workflows:execute', 'executions:read', 'executions:retry'];
