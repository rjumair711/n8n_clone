import { type NextRequest, NextResponse } from "next/server";
import { chatError, openChatRequest } from "@/features/chat-widget/server/http";
import { handOffChat } from "@/features/chat-widget/server/widget";

// "Talk to a human": POST {sessionId, contact?}. The conversation is sent
// to the person set on the Chat Trigger (email, Slack or WhatsApp) and the
// bot stops answering in this conversation.

export const maxDuration = 60;

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = (await request.json().catch(() => null)) as {
            sessionId?: unknown;
            contact?: unknown;
        } | null;

        const opened = await openChatRequest({
            request,
            id,
            sessionId: body?.sessionId,
            limited: true,
        });
        if (!opened.ok) return opened.response;

        const { widget, sessionKey } = opened;

        if (!widget.settings.handoff.enabled) {
            return chatError(404, "This chat has no handoff to a person");
        }

        const contact =
            typeof body?.contact === "string" ? body.contact.trim().slice(0, 200) : "";

        try {
            await handOffChat({ widget, sessionKey, contact });
        } catch (error) {
            // Why (a wrong credential, say) is for the owner, not the visitor
            console.error(
                "Chat handoff error:",
                error instanceof Error ? error.message : error
            );

            return chatError(
                502,
                "We could not reach a person right now. You can keep chatting with the assistant."
            );
        }

        return NextResponse.json({ success: true, paused: true });
    } catch (error) {
        console.error("Chat handoff error:", error instanceof Error ? error.message : error);

        return chatError(500, "The request could not be sent. Try again.");
    }
}
