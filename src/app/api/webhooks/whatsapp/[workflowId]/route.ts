import { createHmac } from "crypto";
import { findTriggerNodes, startWorkflowExecution } from "@/inngest/utils";
import { secretsMatch } from "@/lib/webhook-security";
import { rateLimitResponse } from "@/lib/rate-limit";
import { type NextRequest, NextResponse } from "next/server";
import { NodeType } from "@prisma/client";

type WhatsappTriggerData = {
    verifyToken?: string;
    appSecret?: string;
};

type Params = { params: Promise<{ workflowId: string }> };

/**
 * Meta calls this once when the webhook is saved in the app dashboard: it
 * expects the challenge back if the verify token is the one typed there.
 */
export async function GET(request: NextRequest, { params }: Params) {
    const { workflowId } = await params;
    const query = new URL(request.url).searchParams;

    const triggerNodes = await findTriggerNodes(
        workflowId,
        NodeType.WHATSAPP_TRIGGER
    );

    const provided = query.get("hub.verify_token") || "";

    const verified = triggerNodes.some((node) => {
        const verifyToken = (node.data as WhatsappTriggerData | null)?.verifyToken;

        return !!verifyToken && secretsMatch(provided, verifyToken.trim());
    });

    if (query.get("hub.mode") !== "subscribe" || !verified) {
        return new NextResponse("Verification failed", { status: 403 });
    }

    return new NextResponse(query.get("hub.challenge") || "", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
    });
}

const extractText = (message: any): string | undefined =>
    message?.text?.body ??
    message?.button?.text ??
    message?.interactive?.button_reply?.title ??
    message?.interactive?.list_reply?.title ??
    message?.image?.caption ??
    message?.video?.caption ??
    message?.document?.caption;

// Incoming messages from the WhatsApp Business Cloud API
export async function POST(request: NextRequest, { params }: Params) {
    const { workflowId } = await params;

    const limited = await rateLimitResponse(`whatsapp:${workflowId}`);
    if (limited) return limited;

    const triggerNodes = await findTriggerNodes(
        workflowId,
        NodeType.WHATSAPP_TRIGGER
    );

    if (triggerNodes.length === 0) {
        return NextResponse.json(
            {
                success: false,
                error: "Workflow not found, not active, or it has no WhatsApp trigger",
            },
            { status: 404 }
        );
    }

    // The signature covers the exact bytes Meta sent
    const rawBody = await request.text();
    const signature = (request.headers.get("x-hub-signature-256") || "").replace(
        /^sha256=/,
        ""
    );

    const verified = triggerNodes.some((node) => {
        const appSecret = (node.data as WhatsappTriggerData | null)?.appSecret;
        if (!appSecret) return false;

        const expected = createHmac("sha256", appSecret.trim())
            .update(rawBody, "utf8")
            .digest("hex");

        return secretsMatch(signature, expected);
    });

    if (!verified) {
        return NextResponse.json(
            {
                success: false,
                error: "Invalid signature. Add the Meta app's App Secret to the WhatsApp Trigger node and save the workflow.",
            },
            { status: 401 }
        );
    }

    try {
        const body = JSON.parse(rawBody);

        for (const entry of body.entry ?? []) {
            for (const change of entry.changes ?? []) {
                const value = change.value ?? {};

                // Delivery and read receipts arrive here too; only messages
                // start the workflow
                for (const message of value.messages ?? []) {
                    const contact = (value.contacts ?? []).find(
                        (candidate: any) => candidate.wa_id === message.from
                    );
                    const text = extractText(message);

                    await startWorkflowExecution({
                        workflowId,
                        trigger: NodeType.WHATSAPP_TRIGGER,

                        initialData: {
                            whatsapp: {
                                from: message.from,
                                name: contact?.profile?.name,
                                text,
                                type: message.type,
                                messageId: message.id,
                                timestamp: message.timestamp,
                                phoneNumberId: value.metadata?.phone_number_id,
                                message,
                                raw: value,
                            },

                            // What the AI Agent and its memory look for
                            ...(text ? { chatInput: text } : {}),
                            sessionId: `whatsapp-${message.from}`,
                        },

                        // Meta re-sends a message for days until it gets a 200
                        dedupeKey: message.id,
                    });
                }
            }
        }
    } catch (error) {
        console.error("WhatsApp webhook error:", error);

        return NextResponse.json(
            { success: false, error: "Failed to process the WhatsApp event" },
            { status: 500 }
        );
    }

    return NextResponse.json({ success: true });
}
