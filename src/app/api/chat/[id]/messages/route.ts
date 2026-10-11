import { type NextRequest, NextResponse } from "next/server";
import { CHAT_PAUSED_REPLY, MAX_CHAT_MESSAGE_LENGTH } from "@/lib/chat-widget";
import { createChatReplyToken } from "@/lib/chat-widget-token";
import { chatError, openChatRequest } from "@/features/chat-widget/server/http";
import {
    addChatMessage,
    isChatPaused,
    loadConversation,
    startChatExecution,
} from "@/features/chat-widget/server/widget";

// The messages of one visitor's conversation with a public chat.
//
//   GET  ?session=<id>   the conversation so far, when the page is reopened
//   POST {sessionId, message}
//        starts the workflow at its Chat Trigger; the answer is read from
//        /api/chat/<id>/messages/<executionId>

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
    try {
        const { id } = await params;

        const opened = await openChatRequest({
            request,
            id,
            sessionId: new URL(request.url).searchParams.get("session"),
            limited: false,
        });
        if (!opened.ok) return opened.response;

        const { messages, paused } = await loadConversation(opened.sessionKey);

        return NextResponse.json(
            {
                paused,
                messages: messages.map(({ role, content }) => ({ role, content })),
            },
            { headers: { "Cache-Control": "private, no-store" } }
        );
    } catch (error) {
        console.error("Chat history error:", error instanceof Error ? error.message : error);

        return chatError(500, "The conversation could not be loaded");
    }
}

export async function POST(request: NextRequest, { params }: Params) {
    try {
        const { id } = await params;
        const body = (await request.json().catch(() => null)) as {
            sessionId?: unknown;
            message?: unknown;
        } | null;

        const message = typeof body?.message === "string" ? body.message.trim() : "";

        if (!message) return chatError(400, "Write a message first");

        if (message.length > MAX_CHAT_MESSAGE_LENGTH) {
            return chatError(
                400,
                `A message can have at most ${MAX_CHAT_MESSAGE_LENGTH} characters`
            );
        }

        const opened = await openChatRequest({
            request,
            id,
            sessionId: body?.sessionId,
            limited: true,
        });
        if (!opened.ok) return opened.response;

        const { widget, sessionKey } = opened;

        await addChatMessage(sessionKey, "user", message);

        // A person has the conversation: the bot stays out of it
        if (await isChatPaused(sessionKey)) {
            return NextResponse.json({ success: true, paused: true, reply: CHAT_PAUSED_REPLY });
        }

        const executionId = await startChatExecution({ widget, sessionKey, message });

        return NextResponse.json({
            success: true,
            executionId,
            token: createChatReplyToken(executionId, sessionKey),
        });
    } catch (error) {
        console.error("Chat message error:", error instanceof Error ? error.message : error);

        return chatError(500, "The message could not be sent. Try again.");
    }
}
