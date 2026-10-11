import { NextResponse } from "next/server";
import {
  CHAT_VISITOR_RATE_LIMIT,
  CHAT_WIDGET_RATE_LIMIT,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { isValidChatSessionId, toChatSessionKey } from "@/lib/chat-widget";
import { loadChatWidget, type ChatWidget } from "./widget";

export const chatError = (status: number, error: string) =>
  NextResponse.json({ success: false, error }, { status });

export const chatNotFound = () => chatError(404, "This chat is not available");

const clientIp = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) || "";

/**
 * What every request of a visitor goes through: the widget exists and is
 * public, and the visitor's session id is one a browser of ours made.
 *
 * With `limited` (sending a message, asking for a person) the request is
 * also counted against the widget's limit and the visitor's: per session
 * id, and per address, because a session id is easy to change.
 */
export const openChatRequest = async ({
  request,
  id,
  sessionId,
  limited,
}: {
  request: Request;
  id: string;
  sessionId: unknown;
  limited: boolean;
}): Promise<
  | { ok: false; response: NextResponse }
  | { ok: true; widget: ChatWidget; sessionKey: string }
> => {
  if (!isValidChatSessionId(sessionId)) {
    return { ok: false, response: chatError(400, "The chat session is not valid") };
  }

  if (limited) {
    // The widget's own limit first, so a flood costs one query each
    const overWidget = await rateLimitResponse(`chat:${id}`, CHAT_WIDGET_RATE_LIMIT);
    if (overWidget) return { ok: false, response: overWidget };

    const ip = clientIp(request);

    for (const key of [
      `chat-visitor:${id}:${sessionId}`,
      ...(ip ? [`chat-ip:${id}:${ip}`] : []),
    ]) {
      const overVisitor = await rateLimitResponse(key, CHAT_VISITOR_RATE_LIMIT);
      if (overVisitor) return { ok: false, response: overVisitor };
    }
  }

  const widget = await loadChatWidget(id);
  if (!widget) return { ok: false, response: chatNotFound() };

  return { ok: true, widget, sessionKey: toChatSessionKey(id, sessionId) };
};
