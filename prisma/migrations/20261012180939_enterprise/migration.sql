-- AlterTable
ALTER TABLE "Workflow" ADD COLUMN     "gitSourceId" TEXT;

-- AlterTable
ALTER TABLE "workspace" ADD COLUMN     "environment" TEXT NOT NULL DEFAULT 'development';

-- CreateTable
CREATE TABLE "workspace_git" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "folder" TEXT NOT NULL DEFAULT 'workflows',
    "credentialId" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncAction" TEXT,
    "lastCommit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_git_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "secret_store" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "secret_store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sso_provider" (
    "id" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "oidcConfig" TEXT,
    "samlConfig" TEXT,
    "userId" TEXT,
    "providerId" TEXT NOT NULL,
    "organizationId" TEXT,
    "domain" TEXT NOT NULL,
    "domainVerified" BOOLEAN,

    CONSTRAINT "sso_provider_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspace_git_workspaceId_key" ON "workspace_git"("workspaceId");

-- CreateIndex
CREATE INDEX "secret_store_workspaceId_idx" ON "secret_store"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "secret_store_userId_name_key" ON "secret_store"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "sso_provider_providerId_key" ON "sso_provider"("providerId");

-- CreateIndex
CREATE INDEX "sso_provider_domain_idx" ON "sso_provider"("domain");

-- AddForeignKey
ALTER TABLE "workspace_git" ADD CONSTRAINT "workspace_git_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secret_store" ADD CONSTRAINT "secret_store_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sso_provider" ADD CONSTRAINT "sso_provider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
