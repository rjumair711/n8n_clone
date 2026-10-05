import { NodeType, type Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { fetchFeed } from "@/lib/rss";
import { inngest } from "./client";
import { startWorkflowExecution } from "./utils";

type RssTriggerData = {
  url?: string;
  pollMinutes?: string;
};

type RssTriggerState = {
  lastCheckedAt?: number;
  // The feed address the state belongs to: a changed URL starts over
  url?: string;
  // Items already handled
  seenIds?: string[];
};

const MAX_ITEMS_PER_POLL = 10;
const MAX_SEEN_IDS = 1000;
const DEFAULT_POLL_MINUTES = 5;

/**
 * Checks one RSS Feed Trigger node and starts a run per new item. The first
 * poll only remembers what is in the feed: items that were already there
 * when the workflow was activated do not start runs.
 */
const pollRssTrigger = async ({
  workflowId,
  nodeId,
  data,
  now,
}: {
  workflowId: string;
  nodeId: string;
  data: RssTriggerData;
  now: number;
}) => {
  const url = data.url?.trim();
  if (!url) return { skipped: "no feed URL" };

  const existing = await prisma.triggerState.findUnique({ where: { nodeId } });
  const stored = (existing?.state ?? {}) as RssTriggerState;
  const state = stored.url === url ? stored : {};

  const pollMinutes = Math.max(
    Number(data.pollMinutes) || DEFAULT_POLL_MINUTES,
    1
  );

  // The heartbeat is not exact to the second
  if (
    state.lastCheckedAt &&
    now - state.lastCheckedAt < pollMinutes * 60_000 - 10_000
  ) {
    return { skipped: "not due" };
  }

  const feed = await fetchFeed(url);
  const seen = new Set(state.seenIds ?? []);

  const fresh = state.lastCheckedAt
    ? feed.items.filter((item) => !seen.has(item.id))
    : [];

  // Feeds list the newest item first; runs start oldest first. Anything
  // beyond the cap stays unseen and is picked up by the next poll.
  const batch = fresh.reverse().slice(0, MAX_ITEMS_PER_POLL);

  for (const item of batch) {
    await startWorkflowExecution({
      workflowId,
      trigger: NodeType.RSS_FEED_TRIGGER,
      initialData: {
        rss: {
          ...item,
          feedTitle: feed.title,
          feedUrl: url,
        },
      },
      dedupeKey: `${url}|${item.id}`,
    });
  }

  const handled = state.lastCheckedAt
    ? batch.map((item) => item.id)
    : feed.items.map((item) => item.id);

  const next: RssTriggerState = {
    url,
    lastCheckedAt: now,
    seenIds: [...new Set([...handled, ...seen])].slice(0, MAX_SEEN_IDS),
  };

  await prisma.triggerState.upsert({
    where: { nodeId },
    create: { nodeId, workflowId, state: next as Prisma.InputJsonValue },
    update: { workflowId, state: next as Prisma.InputJsonValue },
  });

  return { started: batch.length, firstPoll: !state.lastCheckedAt };
};

// Feeds have no push, so new items are found by polling
export const rssTriggerPoll = inngest.createFunction(
  { id: "rss-trigger-poll", retries: 0 },
  { cron: "* * * * *" },
  async ({ step, event }) => {
    const triggers = await step.run("fetch-rss-triggers", async () => {
      const nodes = await prisma.node.findMany({
        where: {
          type: NodeType.RSS_FEED_TRIGGER,
          workflow: { active: true },
        },
        select: { id: true, data: true, workflowId: true },
      });

      return nodes.map((node) => ({
        nodeId: node.id,
        workflowId: node.workflowId,
        data: (node.data ?? {}) as RssTriggerData,
      }));
    });

    if (triggers.length === 0) {
      return { status: "skipped", reason: "No active RSS triggers." };
    }

    const now = event.ts ?? Date.now();
    const results: Record<string, unknown> = {};

    for (const trigger of triggers) {
      results[trigger.nodeId] = await step.run(
        `poll-${trigger.nodeId}`,
        async () => {
          try {
            return await pollRssTrigger({ ...trigger, now });
          } catch (error) {
            // One broken feed must not stop the others
            console.error(
              `RSS trigger ${trigger.nodeId} failed:`,
              error instanceof Error ? error.message : error
            );

            return {
              error: error instanceof Error ? error.message : "Unknown error",
            };
          }
        }
      );
    }

    return results;
  }
);
