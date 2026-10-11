import { ExecutionStatus, Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import {
  DEFAULT_RETENTION_DAYS,
  RETENTION_DAY_OPTIONS,
  getRetentionCutoff,
  getStartOfMonth,
} from "@/lib/execution-retention";
import { CHAT_TRANSCRIPT_RETENTION_DAYS } from "@/lib/chat-widget";
import { inngest } from "./client";

const BATCH_SIZE = 500;
// One night's work; whatever is left is picked up the next night
const MAX_BATCHES = 40;

/**
 * Removes execution data that is older than its owner's "Execution data
 * retention" setting. Executions from earlier months are deleted with their
 * node logs. Executions from this month keep their row (status, times and
 * error message), because the monthly execution limit counts them, and lose
 * everything else. Running and waiting executions are never touched.
 */
export const deleteExpiredExecutionData = async (now: Date = new Date()) => {
  const startOfMonth = getStartOfMonth(now);
  let deleted = 0;
  let stripped = 0;

  for (const days of RETENTION_DAY_OPTIONS) {
    const cutoff = getRetentionCutoff(days, now);

    // Users with a value that is not one of the options get the default
    const owner: Prisma.UserWhereInput =
      days === DEFAULT_RETENTION_DAYS
        ? {
            executionRetentionDays: {
              notIn: RETENTION_DAY_OPTIONS.filter((option) => option !== days),
            },
          }
        : { executionRetentionDays: days };

    const expired: Prisma.ExecutionWhereInput = {
      startedAt: { lt: cutoff },
      status: { notIn: [ExecutionStatus.RUNNING, ExecutionStatus.WAITING] },
      workflow: { user: owner },
    };

    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const rows = await prisma.execution.findMany({
        where: { ...expired, startedAt: { lt: cutoff < startOfMonth ? cutoff : startOfMonth } },
        select: { id: true },
        take: BATCH_SIZE,
      });
      if (rows.length === 0) break;

      // Node logs go with their execution (ON DELETE CASCADE)
      const result = await prisma.execution.deleteMany({
        where: { id: { in: rows.map((row) => row.id) } },
      });
      deleted += result.count;
    }

    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const rows = await prisma.execution.findMany({
        where: {
          ...expired,
          startedAt: { lt: cutoff, gte: startOfMonth },
          dataDeletedAt: null,
        },
        select: { id: true },
        take: BATCH_SIZE,
      });
      if (rows.length === 0) break;

      const ids = rows.map((row) => row.id);

      await prisma.$transaction([
        prisma.executionNode.deleteMany({ where: { executionId: { in: ids } } }),
        // They hold tool arguments, which are execution data too
        prisma.approvalRequest.deleteMany({ where: { executionId: { in: ids } } }),
        prisma.execution.updateMany({
          where: { id: { in: ids } },
          data: {
            output: Prisma.DbNull,
            inputData: Prisma.DbNull,
            webhookResponse: Prisma.DbNull,
            errorStack: null,
            dataDeletedAt: now,
          },
        }),
      ]);
      stripped += ids.length;
    }
  }

  return { deleted, stripped };
};

/**
 * Removes the stored conversations of public chat widgets that are older
 * than their retention period. Only the widget's own rows: their session
 * key starts with "widget:".
 */
export const deleteOldChatTranscripts = async (now: Date = new Date()) => {
  const cutoff = new Date(
    now.getTime() - CHAT_TRANSCRIPT_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );

  const deleted = await prisma.chatMessage.deleteMany({
    where: { sessionId: { startsWith: "widget:" }, createdAt: { lt: cutoff } },
  });

  return deleted.count;
};

// Every night, a little after the file cleanup
export const executionDataCleanup = inngest.createFunction(
  { id: "execution-data-cleanup", retries: 1 },
  { cron: "47 3 * * *" },
  async ({ step }) => {
    const result = await step.run("delete-expired-execution-data", () =>
      deleteExpiredExecutionData()
    );

    const chatMessages = await step.run("delete-old-chat-transcripts", () =>
      deleteOldChatTranscripts()
    );

    return { ...result, chatMessages };
  }
);
