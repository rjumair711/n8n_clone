import "server-only";

import { tool, type ToolSet } from "ai";
import { z } from "zod";
import prisma from "./db";
import { uniqueToolName } from "@/features/executions/lib/agent-tools";
import {
  FACT_MAX_PER_CONTACT,
  RECALL_TOOL,
  REMEMBER_TOOL,
  cleanFactValue,
  cleanSummary,
  countMessagesToLoad,
  countMessagesToSummarize,
  normalizeFactKey,
  startWithUser,
  type ContactFactEntry,
  type MemoryMessage,
} from "@/features/executions/lib/memory-options";

// The database side of the Postgres Memory node.
//
//   agent_memory          every message of a session (as the Memory node
//                         always stored them)
//   agent_memory_summary  one running summary per session, and up to which
//                         message it reaches
//   contact_fact          long-term key/value facts per contact
//
// Everything is scoped to the workflow's owner: a session or contact id
// from another account finds nothing.

type SessionKey = { nodeId: string; userId: string; sessionId: string };

/**
 * What the model is given of a session: its newest messages, and the
 * summary of the older ones when the node keeps one.
 */
export const loadSessionMemory = async ({
  nodeId,
  userId,
  sessionId,
  limit,
  summarize,
}: SessionKey & { limit: number; summarize: boolean }): Promise<{
  messages: MemoryMessage[];
  summary: string | null;
}> => {
  const stored = summarize
    ? await prisma.agentMemorySummary.findUnique({
        where: { nodeId_userId_sessionId: { nodeId, userId, sessionId } },
        select: { summary: true, summarizedUntil: true },
      })
    : null;

  const rows = await prisma.agentMemory.findMany({
    where: {
      nodeId,
      userId,
      sessionId,
      // What the summary already covers is not shown a second time
      ...(stored ? { createdAt: { gt: stored.summarizedUntil } } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: countMessagesToLoad(limit, summarize),
    select: { role: true, content: true },
  });

  const messages = startWithUser(
    rows.reverse().map((row) => ({
      role: row.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: row.content,
    }))
  );

  return { messages, summary: stored?.summary ?? null };
};

/**
 * Saves one turn. The two messages get times one millisecond apart, so
 * their order never depends on how the database happens to return rows
 * with the same time.
 */
export const saveSessionTurn = async ({
  nodeId,
  userId,
  sessionId,
  userMessage,
  assistantMessage,
  now = new Date(),
}: SessionKey & { userMessage: string; assistantMessage: string; now?: Date }) => {
  await prisma.agentMemory.createMany({
    data: [
      { nodeId, userId, sessionId, role: "user", content: userMessage, createdAt: now },
      {
        nodeId,
        userId,
        sessionId,
        role: "assistant",
        content: assistantMessage,
        createdAt: new Date(now.getTime() + 1),
      },
    ],
  });
};

/**
 * The messages that have fallen out of the window and are not in the
 * summary yet, when a batch of them has gathered; otherwise null.
 */
export const findMessagesToSummarize = async ({
  nodeId,
  userId,
  sessionId,
  limit,
}: SessionKey & { limit: number }): Promise<{
  previous: string;
  messages: MemoryMessage[];
  // The time of the last message that goes into the summary
  until: string;
} | null> => {
  const stored = await prisma.agentMemorySummary.findUnique({
    where: { nodeId_userId_sessionId: { nodeId, userId, sessionId } },
    select: { summary: true, summarizedUntil: true },
  });

  const where = {
    nodeId,
    userId,
    sessionId,
    ...(stored ? { createdAt: { gt: stored.summarizedUntil } } : {}),
  };

  const count = countMessagesToSummarize(await prisma.agentMemory.count({ where }), limit);
  if (count === 0) return null;

  const rows = await prisma.agentMemory.findMany({
    where,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: count,
    select: { role: true, content: true, createdAt: true },
  });

  if (rows.length === 0) return null;

  return {
    previous: stored?.summary ?? "",
    messages: rows.map((row) => ({
      role: row.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: row.content,
    })),
    until: rows[rows.length - 1].createdAt.toISOString(),
  };
};

export const saveSessionSummary = async ({
  nodeId,
  userId,
  sessionId,
  summary,
  until,
}: SessionKey & { summary: string; until: string }) => {
  const data = { summary: cleanSummary(summary), summarizedUntil: new Date(until) };

  await prisma.agentMemorySummary.upsert({
    where: { nodeId_userId_sessionId: { nodeId, userId, sessionId } },
    create: { nodeId, userId, sessionId, ...data },
    update: data,
  });
};

// =========================================================================
// LONG-TERM FACTS
// =========================================================================
export const listContactFacts = async (
  userId: string,
  contactId: string
): Promise<ContactFactEntry[]> =>
  prisma.contactFact.findMany({
    where: { userId, contactId },
    orderBy: { key: "asc" },
    take: FACT_MAX_PER_CONTACT,
    select: { key: true, value: true },
  });

/**
 * Saves, changes or (with an empty value) removes one fact. Returns what
 * happened in words the model can pass on or act on.
 */
export const saveContactFact = async (
  userId: string,
  contactId: string,
  rawKey: unknown,
  rawValue: unknown
): Promise<{ saved: boolean; message: string }> => {
  const key = normalizeFactKey(rawKey);

  if (!key) {
    return { saved: false, message: "The key must have letters or digits, for example favourite_colour." };
  }

  const value = cleanFactValue(rawValue);

  if (!value) {
    const removed = await prisma.contactFact.deleteMany({
      where: { userId, contactId, key },
    });

    return {
      saved: removed.count > 0,
      message: removed.count > 0 ? `Removed "${key}".` : `Nothing was saved under "${key}".`,
    };
  }

  const existing = await prisma.contactFact.findUnique({
    where: { userId_contactId_key: { userId, contactId, key } },
    select: { id: true },
  });

  if (!existing) {
    const count = await prisma.contactFact.count({ where: { userId, contactId } });

    if (count >= FACT_MAX_PER_CONTACT) {
      return {
        saved: false,
        message: `There are already ${FACT_MAX_PER_CONTACT} facts about this person, the most that are kept. Remove one (save it with an empty value) or change an existing one.`,
      };
    }
  }

  await prisma.contactFact.upsert({
    where: { userId_contactId_key: { userId, contactId, key } },
    create: { userId, contactId, key, value },
    update: { value },
  });

  return { saved: true, message: `${existing ? "Updated" : "Saved"} "${key}".` };
};

/**
 * The two tools the agent gets for a contact's facts, under names no other
 * tool of the agent has.
 */
export const buildFactTools = ({
  userId,
  contactId,
  takenNames,
}: {
  userId: string;
  contactId: string;
  takenNames: Set<string>;
}): { tools: ToolSet; names: { recall: string; remember: string } } => {
  const names = {
    recall: uniqueToolName(RECALL_TOOL, takenNames),
    remember: uniqueToolName(REMEMBER_TOOL, takenNames),
  };

  return {
    names,
    tools: {
      [names.recall]: tool({
        description:
          "Reads everything saved about the person you are talking to: a list of key and value pairs from earlier conversations.",
        inputSchema: z.object({}),
        execute: async () => {
          try {
            const facts = await listContactFacts(userId, contactId);

            return { facts, count: facts.length };
          } catch {
            return { error: "The saved facts could not be read" };
          }
        },
      }),

      [names.remember]: tool({
        description:
          "Saves one lasting fact about the person you are talking to, for future conversations. Saving under a key that exists replaces its value; an empty value removes the fact. Do not save secrets.",
        inputSchema: z.object({
          key: z
            .string()
            .describe("A short name for the fact in lower case, for example name, city or preferred_language"),
          value: z.string().describe("The fact itself, in a few words. Empty to remove it."),
        }),
        execute: async ({ key, value }: { key: string; value: string }) => {
          try {
            return await saveContactFact(userId, contactId, key, value);
          } catch {
            return { error: "The fact could not be saved" };
          }
        },
      }),
    },
  };
};
