-- CreateTable
CREATE TABLE "message_usage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "message_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "message_usage_userId_channel_day_key" ON "message_usage"("userId", "channel", "day");

-- AddForeignKey
ALTER TABLE "message_usage" ADD CONSTRAINT "message_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
