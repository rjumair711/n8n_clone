import { ExecutionStatus, NodeType } from "@prisma/client";
import prisma from "@/lib/db";
import { TRIGGER_SOURCES } from "@/config/trigger-sources";
import { sendWorkflowExecution } from "@/inngest/utils";
import type { StepTools } from "@/features/executions/types";
import { sendChannelMessage } from "@/features/approvals/server/notify";
import {
  CHAT_HISTORY_LIMIT,
  buildHandoffMessage,
  parseChatWidgetSettings,
  readPublicReply,
  type ChatWidgetSettings,
} from "@/lib/chat-widget";

// The public chat of a Chat Trigger. A conversation is kept in ChatMessage
// under its session key ("widget:<id>:<visitor session>"), with the roles
//   user / assistant   what was said
//   handoff            the visitor asked for a person: the bot is paused

const ROLE_HANDOFF = "handoff";

export type ChatWidget = {
  id: string;
  workflowId: string;
  workflowName: string;
  // The workflow's owner
  userId: string;
  settings: ChatWidgetSettings;
};

/**
 * The widget behind an id: a Chat Trigger node with "Make chat public" on,
 * in an active workflow. Null otherwise.
 */
export const loadChatWidget = async (id: string): Promise<ChatWidget | null> => {
  const node = await prisma.node.findFirst({
    where: {
      id,
      type: NodeType.CHAT_TRIGGER,
      workflow: { active: true },
    },
    select: {
      data: true,
      workflowId: true,
      workflow: { select: { userId: true, name: true } },
    },
  });

  if (!node) return null;

  const settings = parseChatWidgetSettings(node.data as Record<string, unknown> | null);

  if (!settings.public) return null;

  return {
    id,
    workflowId: node.workflowId,
    workflowName: node.workflow.name,
    userId: node.workflow.userId,
    settings,
  };
};

export const addChatMessage = (
  sessionKey: string,
  role: "user" | "assistant",
  content: string,
  // Given for the bot's answers, so asking twice stores it once
  id?: string
) =>
  prisma.chatMessage.createMany({
    data: [{ ...(id ? { id } : {}), sessionId: sessionKey, role, content }],
    skipDuplicates: true,
  });

/**
 * The conversation so far, oldest first, and whether a person has taken it
 * over.
 */
export const loadConversation = async (sessionKey: string) => {
  const rows = await prisma.chatMessage.findMany({
    where: { sessionId: sessionKey },
    orderBy: { createdAt: "desc" },
    take: CHAT_HISTORY_LIMIT,
    select: { id: true, role: true, content: true, createdAt: true },
  });

  const paused =
    rows.some((row) => row.role === ROLE_HANDOFF) || (await isChatPaused(sessionKey));

  return {
    paused,
    messages: rows
      .filter((row) => row.role === "user" || row.role === "assistant")
      .reverse(),
  };
};

export const isChatPaused = async (sessionKey: string) =>
  (await prisma.chatMessage.count({
    where: { sessionId: sessionKey, role: ROLE_HANDOFF },
  })) > 0;

/**
 * Starts the workflow at its Chat Trigger for one message of a visitor,
 * the way the editor's chat panel does.
 */
export const startChatExecution = async ({
  widget,
  sessionKey,
  message,
}: {
  widget: ChatWidget;
  sessionKey: string;
  message: string;
}) => {
  const execution = await prisma.execution.create({
    data: {
      workflowId: widget.workflowId,
      status: ExecutionStatus.RUNNING,
      triggerSource: TRIGGER_SOURCES.CHAT,
    },
  });

  await sendWorkflowExecution({
    workflowId: widget.workflowId,
    executionId: execution.id,
    trigger: NodeType.CHAT_TRIGGER,
    InitialData: {
      action: "sendMessage",
      chatInput: message,
      // One Buffer Memory history per visitor of this widget
      sessionId: sessionKey,
      chatSource: "widget",
    },
  });

  return execution.id;
};

export type ChatReply =
  | { status: "pending" }
  | { status: "done"; reply: string }
  | { status: "failed" };

/**
 * The bot's answer to a message, once its run has finished. The answer is
 * added to the stored conversation the first time it is read.
 */
export const readChatReply = async ({
  widget,
  executionId,
  sessionKey,
}: {
  widget: ChatWidget;
  executionId: string;
  sessionKey: string;
}): Promise<ChatReply> => {
  const execution = await prisma.execution.findFirst({
    // Of this widget's workflow only
    where: { id: executionId, workflowId: widget.workflowId },
    select: { status: true, output: true },
  });

  if (!execution || execution.status === ExecutionStatus.FAILED) {
    return { status: "failed" };
  }

  if (execution.status !== ExecutionStatus.SUCCESS) {
    return { status: "pending" };
  }

  const reply = readPublicReply(execution.output);

  // Nothing to show: the workflow produced no answer, or it is set not to
  // save its run data
  if (!reply) return { status: "failed" };

  await addChatMessage(sessionKey, "assistant", reply, `reply_${executionId}`);

  return { status: "done", reply };
};

/**
 * "Talk to a human": sends the conversation to the person set on the Chat
 * Trigger and pauses the bot for this conversation. Asking again does
 * nothing more. Throws when the message could not be sent; the bot then
 * keeps answering.
 */
export const handOffChat = async ({
  widget,
  sessionKey,
  contact,
}: {
  widget: ChatWidget;
  sessionKey: string;
  contact: string;
}): Promise<{ alreadyHandedOff: boolean }> => {
  if (await isChatPaused(sessionKey)) return { alreadyHandedOff: true };

  const { handoff, title } = widget.settings;
  const { messages } = await loadConversation(sessionKey);

  const message = buildHandoffMessage({
    title,
    workflowName: widget.workflowName,
    contact,
    transcript: messages,
  });

  await sendChannelMessage({
    delivery: {
      channel: handoff.channel,
      credentialId: handoff.credentialId,
      recipient: handoff.recipient,
      webhookUrl: handoff.webhookUrl,
      phoneNumberId: handoff.phoneNumberId,
    },
    text: message.text,
    email: { subject: message.subject, html: message.html },
    userId: widget.userId,
    nodeId: widget.id,
    // Not inside a workflow run
    step: {} as StepTools,
    context: {},
  });

  // One marker per conversation, also when two requests arrive together
  await prisma.chatMessage.createMany({
    data: [
      {
        id: `handoff_${sessionKey}`.slice(0, 190),
        sessionId: sessionKey,
        role: ROLE_HANDOFF,
        content: contact,
      },
    ],
    skipDuplicates: true,
  });

  return { alreadyHandedOff: false };
};
