import { google } from "googleapis";
import { NodeType, type Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { getGoogleAuthFromCredential } from "@/lib/google-oauth";
import { getRequiredPlanForNode } from "@/config/plans";
import { summarizeMessage } from "@/features/executions/components/gmail/executor";
import { inngest } from "./client";
import { startWorkflowExecution } from "./utils";

type GmailTriggerData = {
  credentialId?: string;
  // Gmail search syntax, e.g. "is:unread from:orders@example.com"
  query?: string;
  pollMinutes?: string;
};

type GmailTriggerState = {
  // Messages received after this moment are new
  lastCheckedAt?: number;
  // Ids already handled, because Gmail's "after:" filter is only to the second
  seenIds?: string[];
};

const MAX_MESSAGES_PER_POLL = 10;
const MAX_SEEN_IDS = 200;
// Looks a little further back than the last poll so nothing is missed
const OVERLAP_SECONDS = 120;

/**
 * Checks one Gmail Trigger node for new mail and starts a run per message.
 * The first poll only records the time: mail that was already in the inbox
 * when the workflow was activated does not start runs.
 */
const pollGmailTrigger = async ({
  workflowId,
  userId,
  nodeId,
  data,
  now,
}: {
  workflowId: string;
  userId: string;
  nodeId: string;
  data: GmailTriggerData;
  now: number;
}) => {
  if (!data.credentialId) return { skipped: "no credential" };

  const existing = await prisma.triggerState.findUnique({ where: { nodeId } });
  const state = (existing?.state ?? {}) as GmailTriggerState;

  const saveState = (next: GmailTriggerState) =>
    prisma.triggerState.upsert({
      where: { nodeId },
      create: { nodeId, workflowId, state: next as Prisma.InputJsonValue },
      update: { workflowId, state: next as Prisma.InputJsonValue },
    });

  if (!state.lastCheckedAt) {
    await saveState({ lastCheckedAt: now, seenIds: [] });
    return { started: 0, firstPoll: true };
  }

  const pollMinutes = Math.max(Number(data.pollMinutes) || 1, 1);
  // The heartbeat is not exact to the second
  if (now - state.lastCheckedAt < pollMinutes * 60_000 - 10_000) {
    return { skipped: "not due" };
  }

  const credential = await prisma.credential.findUnique({
    where: { id: data.credentialId, userId },
  });
  if (!credential) return { skipped: "credential not found" };

  const gmail = google.gmail({
    version: "v1",
    auth: getGoogleAuthFromCredential("Gmail Trigger", credential.value),
  });

  const after = Math.floor(state.lastCheckedAt / 1000) - OVERLAP_SECONDS;

  const list = await gmail.users.messages.list({
    userId: "me",
    q: `${(data.query || "").trim()} after:${after}`.trim(),
    maxResults: 25,
  });

  const seen = new Set(state.seenIds ?? []);
  const listedIds = (list.data.messages ?? []).flatMap((entry) =>
    entry.id ? [entry.id] : []
  );

  const newIds = listedIds
    .filter((id) => !seen.has(id))
    .slice(0, MAX_MESSAGES_PER_POLL);

  const messages = await Promise.all(
    newIds.map(async (id) => {
      const message = await gmail.users.messages.get({
        userId: "me",
        id,
        format: "full",
      });

      return message.data;
    })
  );

  // Oldest first, and only mail that arrived since the last poll: the
  // search above also returns the overlap
  const fresh = messages
    .filter(
      (message) =>
        Number(message.internalDate ?? 0) >= state.lastCheckedAt! - 1000
    )
    .sort((a, b) => Number(a.internalDate ?? 0) - Number(b.internalDate ?? 0));

  for (const message of fresh) {
    await startWorkflowExecution({
      workflowId,
      trigger: NodeType.GMAIL_TRIGGER,
      initialData: { gmail: summarizeMessage(message) },
      dedupeKey: message.id,
    });
  }

  await saveState({
    lastCheckedAt: now,
    seenIds: [...new Set([...newIds, ...listedIds, ...seen])].slice(
      0,
      MAX_SEEN_IDS
    ),
  });

  return { started: fresh.length };
};

// Gmail has no push without a Pub/Sub topic, so new mail is found by
// polling, the same way n8n's Gmail Trigger does it
export const gmailTriggerPoll = inngest.createFunction(
  { id: "gmail-trigger-poll", retries: 0 },
  { cron: "* * * * *" },
  async ({ step, event }) => {
    const triggers = await step.run("fetch-gmail-triggers", async () => {
      const nodes = await prisma.node.findMany({
        where: {
          type: NodeType.GMAIL_TRIGGER,
          workflow: { active: true },
        },
        select: {
          id: true,
          data: true,
          workflowId: true,
          workflow: {
            select: {
              userId: true,
              user: { select: { plan: true, trialEndsAt: true } },
            },
          },
        },
      });

      return nodes
        .filter(
          (node) =>
            !getRequiredPlanForNode(
              NodeType.GMAIL_TRIGGER,
              node.workflow.user.plan,
              node.workflow.user.trialEndsAt
            )
        )
        .map((node) => ({
          nodeId: node.id,
          workflowId: node.workflowId,
          userId: node.workflow.userId,
          data: (node.data ?? {}) as GmailTriggerData,
        }));
    });

    if (triggers.length === 0) {
      return { status: "skipped", reason: "No active Gmail triggers." };
    }

    const now = event.ts ?? Date.now();
    const results: Record<string, unknown> = {};

    for (const trigger of triggers) {
      results[trigger.nodeId] = await step.run(
        `poll-${trigger.nodeId}`,
        async () => {
          try {
            return await pollGmailTrigger({ ...trigger, now });
          } catch (error) {
            // One broken mailbox must not stop the others
            console.error(
              `Gmail trigger ${trigger.nodeId} failed:`,
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
