import { findTriggerNodes, startWorkflowExecution } from "@/inngest/utils";
import { verifyBase64HmacSignature } from "@/lib/webhook-security";
import {
    buildWoocommerceTriggerData,
    isWoocommercePing,
    matchWoocommerceDelivery,
} from "@/lib/store-webhooks";
import { rateLimitResponse } from "@/lib/rate-limit";
import { type NextRequest, NextResponse } from "next/server";
import { NodeType } from "@prisma/client";

type WoocommerceTriggerData = {
    secret?: string;
    event?: string;
    orderStatus?: string;
};

// WooCommerce posts the store's events (orders, products, customers) here
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ workflowId: string }> }
) {
    const { workflowId } = await params;

    const limited = await rateLimitResponse(`woocommerce:${workflowId}`);
    if (limited) return limited;

    const triggerNodes = await findTriggerNodes(
        workflowId,
        NodeType.WOOCOMMERCE_TRIGGER
    );

    if (triggerNodes.length === 0) {
        return NextResponse.json(
            {
                success: false,
                error: "Workflow not found, not active, or it has no WooCommerce trigger",
            },
            { status: 404 }
        );
    }

    const rawBody = await request.text();
    const signatureHeader = request.headers.get("x-wc-webhook-signature");

    // The check WooCommerce makes when a webhook is saved. It is not signed
    // and carries nothing, so it is answered and starts nothing.
    if (isWoocommercePing(rawBody, signatureHeader)) {
        return NextResponse.json({ success: true, ping: true });
    }

    // The signature covers the exact bytes WooCommerce sent:
    // base64(HMAC-SHA256(raw body, the webhook's secret))
    const verifiedNodes = triggerNodes.filter((node) => {
        const secret = (node.data as WoocommerceTriggerData | null)?.secret?.trim();

        return (
            !!secret &&
            verifyBase64HmacSignature({ rawBody, signatureHeader, secret })
        );
    });

    if (verifiedNodes.length === 0) {
        return NextResponse.json(
            {
                success: false,
                error: "Invalid signature. Use the same Secret in the WooCommerce webhook and in the WooCommerce Trigger node, then save the workflow.",
            },
            { status: 401 }
        );
    }

    let body: unknown;
    try {
        body = JSON.parse(rawBody);
    } catch {
        return NextResponse.json(
            { success: false, error: "The request body is not JSON" },
            { status: 400 }
        );
    }

    const topic = (request.headers.get("x-wc-webhook-topic") || "").trim().toLowerCase();

    let match: { event: string; dedupeKey: string } | null = null;
    for (const node of verifiedNodes) {
        match = matchWoocommerceDelivery({
            settings: (node.data ?? {}) as WoocommerceTriggerData,
            topic,
            body,
            deliveryId: request.headers.get("x-wc-webhook-delivery-id"),
            rawBody,
        });

        if (match) break;
    }

    // Another event, or an order in another status: answered 200, because
    // WooCommerce switches a webhook off after five failed deliveries
    if (!match) {
        return NextResponse.json({ success: true, ignored: true });
    }

    try {
        await startWorkflowExecution({
            workflowId,
            trigger: NodeType.WOOCOMMERCE_TRIGGER,

            initialData: {
                woocommerce: buildWoocommerceTriggerData({
                    event: match.event,
                    topic,
                    source: (request.headers.get("x-wc-webhook-source") || "").trim(),
                    body,
                }),
            },

            dedupeKey: match.dedupeKey,
        });
    } catch (error) {
        console.error("WooCommerce webhook error:", error);

        return NextResponse.json(
            { success: false, error: "Failed to process the WooCommerce event" },
            { status: 500 }
        );
    }

    return NextResponse.json({ success: true });
}
