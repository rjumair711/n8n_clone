-- CreateTable
CREATE TABLE "workflow_template" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'General',
    "minPlan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
    "published" BOOLEAN NOT NULL DEFAULT true,
    "nodes" JSONB NOT NULL,
    "connections" JSONB NOT NULL,
    "nodeTypes" TEXT[],
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_template_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workflow_template_published_category_idx" ON "workflow_template"("published", "category");
