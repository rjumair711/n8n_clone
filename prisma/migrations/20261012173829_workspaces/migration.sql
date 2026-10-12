-- AlterTable
ALTER TABLE "Credential" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "Workflow" ADD COLUMN     "workspaceId" TEXT;

-- CreateTable
CREATE TABLE "workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_member" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_invite" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_invite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspace_ownerId_key" ON "workspace"("ownerId");

-- CreateIndex
CREATE INDEX "workspace_member_userId_idx" ON "workspace_member"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_member_workspaceId_userId_key" ON "workspace_member"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "workspace_invite_email_idx" ON "workspace_invite"("email");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_invite_workspaceId_email_key" ON "workspace_invite"("workspaceId", "email");

-- CreateIndex
CREATE INDEX "Credential_workspaceId_idx" ON "Credential"("workspaceId");

-- CreateIndex
CREATE INDEX "Workflow_workspaceId_idx" ON "Workflow"("workspaceId");

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_member" ADD CONSTRAINT "workspace_member_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_member" ADD CONSTRAINT "workspace_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_invite" ADD CONSTRAINT "workspace_invite_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every user gets a personal workspace and is its owner, and the
-- user's workflows and credentials are put in it. Safe to run twice: a
-- user who has a workspace is skipped, a membership that exists is kept,
-- and only rows without a workspace are touched.
INSERT INTO "workspace" ("id", "name", "ownerId", "createdAt", "updatedAt")
SELECT
    'ws_' || u."id",
    CASE WHEN btrim(u."name") = '' THEN 'My workspace' ELSE btrim(u."name") || '''s workspace' END,
    u."id",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "user" u
ON CONFLICT ("ownerId") DO NOTHING;

INSERT INTO "workspace_member" ("id", "workspaceId", "userId", "role", "createdAt")
SELECT 'wm_' || w."ownerId", w."id", w."ownerId", 'OWNER', CURRENT_TIMESTAMP
FROM "workspace" w
ON CONFLICT ("workspaceId", "userId") DO NOTHING;

UPDATE "Workflow" wf
SET "workspaceId" = w."id"
FROM "workspace" w
WHERE w."ownerId" = wf."userId" AND wf."workspaceId" IS NULL;

UPDATE "Credential" c
SET "workspaceId" = w."id"
FROM "workspace" w
WHERE w."ownerId" = c."userId" AND c."workspaceId" IS NULL;
