import type { NextRequest } from "next/server";
import { buildFrameAncestors, toPublicChatConfig } from "@/lib/chat-widget";
import { loadChatWidget } from "@/features/chat-widget/server/widget";

// The hosted chat page of a public Chat Trigger: <app>/chat/<id>. Opened
// directly it is a full-page chat; widget.js shows the same page in a
// frame on a website.
//
// This is the one route of the app that other sites may frame (see
// EMBEDDABLE_PATH_PREFIXES in config/security-headers.ts). Which sites is
// decided here, per widget, with frame-ancestors: the widget's allowed
// domains, or any site when the list is empty.
//
// A plain HTML document on purpose: it loads one small script instead of
// the app's bundle, and its headers can be set per widget.

const escapeHtml = (value: string) =>
    value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

const document = (title: string, direction: string, body: string) =>
    `<!doctype html><html lang="en" dir="${direction}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title><link rel="stylesheet" href="/widget-chat.css"></head><body>${body}</body></html>`;

const headers = (frameAncestors: string) => ({
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": frameAncestors,
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex",
});

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    let widget: Awaited<ReturnType<typeof loadChatWidget>> = null;
    try {
        widget = await loadChatWidget(id);
    } catch (error) {
        console.error("Chat page error:", error instanceof Error ? error.message : error);
    }

    if (!widget) {
        return new Response(
            document(
                "Chat",
                "ltr",
                `<main class="rxj-unavailable">This chat is not available.</main>`
            ),
            // Nothing to embed: no site may frame it
            { status: 404, headers: headers("frame-ancestors 'none'") }
        );
    }

    const config = toPublicChatConfig(id, widget.settings);

    // Read by /widget-chat.js. "<" is escaped so the data cannot end its
    // script element.
    const json = JSON.stringify(config).replace(/</g, "\\u003c");

    return new Response(
        document(
            config.title,
            config.direction,
            `<div id="rxj-chat"></div><script id="rxj-chat-config" type="application/json">${json}</script><script src="/widget-chat.js" defer></script>`
        ),
        { headers: headers(buildFrameAncestors(widget.settings.allowedDomains)) }
    );
}
