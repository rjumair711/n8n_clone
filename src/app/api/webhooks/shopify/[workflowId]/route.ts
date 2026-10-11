import { findTriggerNodes, startWorkflowExecution } from "@/inngest/utils";
import { verifyBase64HmacSignature } from "@/lib/webhook-security";
import {
    buildShopifyTriggerData,
    matchesShopifyEvent,
    shopifyDedupeKey,
} from "@/lib/store-webhooks";
import { rateLimitResponse } from "@/lib/rate-limit";
import { type NextRequest, NextResponse } from "next/server";
import { NodeType } from "@prisma/client";

type ShopifyTriggerData = {
    signingSecret?: string;
    event?: string;
};

// Shopify posts the store's events (orders, products, customers...) here
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ workflowId: string }> }
) {
    const { workflowId } = await params;

    const limited = await rateLimitResponse(`shopify:${workflowId}`);
    if (limited) return limited;

    const triggerNodes = await findTriggerNodes(
        workflowId,
        NodeType.SHOPIFY_TRIGGER
    );

    if (triggerNodes.length === 0) {
        return NextResponse.json(
            {
                success: false,
                error: "Workflow not found, not active, or it has no Shopify trigger",
            },
            { status: 404 }
        );
    }

    // The signature covers the exact bytes Shopify sent:
    // base64(HMAC-SHA256(raw body, the webhook signing secret))
    const rawBody = await request.text();
    const signatureHeader = request.headers.get("x-shopify-hmac-sha256");

    const verifiedNodes = triggerNodes.filter((node) => {
        const secret = (node.data as ShopifyTriggerData | null)?.signingSecret?.trim();

        return (
            !!secret &&
            verifyBase64HmacSignature({ rawBody, signatureHeader, secret })
        );
    });

    if (verifiedNodes.length === 0) {
        return NextResponse.json(
            {
                success: false,
                error: "Invalid signature. Copy the signing secret from Shopify (Settings > Notifications > Webhooks) into the Shopify Trigger node and save the workflow.",
            },
            { status: 401 }
        );
    }

    const topic = (request.headers.get("x-shopify-topic") || "").trim().toLowerCase();

    // A webhook for another event that points at this address is answered
    // 200: Shopify removes a webhook that keeps failing
    const listening = verifiedNodes.some((node) =>
        matchesShopifyEvent((node.data as ShopifyTriggerData | null)?.event, topic)
    );

    if (!listening) {
        return NextResponse.json({ success: true, ignored: true });
    }

    let body: unknown;
    try {
        body = JSON.parse(rawBody);
    } catch {
        return NextResponse.json(
            {
                success: false,
                error: "The request body is not JSON. Set the webhook's format to JSON in Shopify.",
            },
            { status: 400 }
        );
    }

    try {
        await startWorkflowExecution({
            workflowId,
            trigger: NodeType.SHOPIFY_TRIGGER,

            initialData: {
                shopify: buildShopifyTriggerData({
                    topic,
                    shopDomain: (request.headers.get("x-shopify-shop-domain") || "").trim(),
                    body,
                }),
            },

            // Shopify re-sends an event until it gets a 2xx answer
            dedupeKey: shopifyDedupeKey({
                topic,
                eventId: request.headers.get("x-shopify-event-id"),
                webhookId: request.headers.get("x-shopify-webhook-id"),
                rawBody,
            }),
        });
    } catch (error) {
        console.error("Shopify webhook error:", error);

        return NextResponse.json(
            { success: false, error: "Failed to process the Shopify event" },
            { status: 500 }
        );
    }

    return NextResponse.json({ success: true });
}
