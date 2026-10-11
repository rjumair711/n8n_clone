import { type NextRequest, NextResponse } from "next/server";
import { verifyChatReplyToken } from "@/lib/chat-widget-token";
import {
    chatError,
    chatNotFound,
    openChatRequest,
} from "@/features/chat-widget/server/http";
import { readChatReply } from "@/features/chat-widget/server/widget";

// The bot's answer to one message. The visitor's page asks every second
// while it shows the typing indicator:
//   GET ?session=<id>&token=<from the POST that sent the message>
//   -> { status: "pending" } | { status: "done", reply } | { status: "failed" }

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; executionId: string }> }
) {
    try {
        const { id, executionId } = await params;
        const query = new URL(request.url).searchParams;

        const opened = await openChatRequest({
            request,
            id,
            sessionId: query.get("session"),
            limited: false,
        });
        if (!opened.ok) return opened.response;

        // Made for this run in this conversation
        if (!verifyChatReplyToken(executionId, opened.sessionKey, query.get("token"))) {
            return chatNotFound();
        }

        const reply = await readChatReply({
            widget: opened.widget,
            executionId,
            sessionKey: opened.sessionKey,
        });

        return NextResponse.json(reply, {
            headers: { "Cache-Control": "private, no-store" },
        });
    } catch (error) {
        console.error("Chat reply error:", error instanceof Error ? error.message : error);

        return chatError(500, "The answer could not be loaded");
    }
}
