import { type NextRequest, NextResponse } from "next/server";
import { isDomainAllowed, toPublicChatConfig } from "@/lib/chat-widget";
import { loadChatWidget } from "@/features/chat-widget/server/widget";

// What widget.js on a website asks for before it draws the chat button:
// the title, the colour, the avatar. It is called from that website, so it
// answers across origins; a site that is not on the widget's allowed list
// is refused and gets no button. (What really keeps other sites out is the
// chat page's frame-ancestors header, see /chat/<id>.)

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Cache-Control": "public, max-age=60",
};

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const widget = await loadChatWidget(id);

        if (!widget) {
            return NextResponse.json(
                { success: false, error: "This chat is not available" },
                { status: 404, headers: CORS }
            );
        }

        // Sent by browsers for a request from another site
        const origin = request.headers.get("origin");

        if (origin && !isDomainAllowed(origin, widget.settings.allowedDomains)) {
            // The app's own pages are always allowed
            const self = new URL(request.url).origin;

            if (origin !== self) {
                return NextResponse.json(
                    { success: false, error: "This site may not show this chat" },
                    { status: 403, headers: CORS }
                );
            }
        }

        return NextResponse.json(toPublicChatConfig(id, widget.settings), {
            headers: CORS,
        });
    } catch (error) {
        console.error("Chat config error:", error instanceof Error ? error.message : error);

        return NextResponse.json(
            { success: false, error: "This chat is not available" },
            { status: 500, headers: CORS }
        );
    }
}

export function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS });
}
