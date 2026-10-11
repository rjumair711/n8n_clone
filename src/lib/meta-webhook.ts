import "server-only";

import { createHmac } from "crypto";
import { type NextRequest, NextResponse } from "next/server";
import type { NodeType } from "@prisma/client";
import { findTriggerNodes, startWorkflowExecution } from "@/inngest/utils";
import { secretsMatch } from "@/lib/webhook-security";
import { rateLimitResponse } from "@/lib/rate-limit";
import { type MetaChannel, parseMetaMessages } from "@/lib/meta-messaging";

// The webhook of the Messenger and Instagram triggers. Meta uses the same
// two calls for both, and for WhatsApp:
//
//   GET   once, when the webhook is saved in the app dashboard: the
//         challenge is returned if the verify token is the one typed there
//   POST  every event, signed with the app secret in X-Hub-Signature-256

type MetaTriggerData = {
    verifyToken?: string;
    appSecret?: string;
};

type Params = { params: Promise<{ workflowId: string }> };

export const createMetaWebhookHandlers = ({
    channel,
    nodeType,
    label,
}: {
    channel: MetaChannel;
    nodeType: NodeType;
    // "Messenger", "Instagram"
    label: string;
}) => {
    const GET = async (request: NextRequest, { params }: Params) => {
        const { workflowId } = await params;
        const query = new URL(request.url).searchParams;

        const triggerNodes = await findTriggerNodes(workflowId, nodeType);

        const provided = query.get("hub.verify_token") || "";

        const verified = triggerNodes.some((node) => {
            const verifyToken = (node.data as MetaTriggerData | null)?.verifyToken;

            return !!verifyToken && secretsMatch(provided, verifyToken.trim());
        });

        if (query.get("hub.mode") !== "subscribe" || !verified) {
            return new NextResponse("Verification failed", { status: 403 });
        }

        return new NextResponse(query.get("hub.challenge") || "", {
            status: 200,
            headers: { "Content-Type": "text/plain" },
        });
    };

    const POST = async (request: NextRequest, { params }: Params) => {
        const { workflowId } = await params;

        const limited = await rateLimitResponse(`${channel}:${workflowId}`);
        if (limited) return limited;

        const triggerNodes = await findTriggerNodes(workflowId, nodeType);

        if (triggerNodes.length === 0) {
            return NextResponse.json(
                {
                    success: false,
                    error: `Workflow not found, not active, or it has no ${label} trigger`,
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
            const appSecret = (node.data as MetaTriggerData | null)?.appSecret;
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
                    error: `Invalid signature. Add the Meta app's App Secret to the ${label} Trigger node and save the workflow.`,
                },
                { status: 401 }
            );
        }

        try {
            // Read receipts, echoes of the account's own messages and
            // events of another kind arrive here too; only messages from
            // people start the workflow
            for (const message of parseMetaMessages(channel, JSON.parse(rawBody))) {
                await startWorkflowExecution({
                    workflowId,
                    trigger: nodeType,

                    initialData: {
                        [channel]: message.data,
                        ...(message.chatInput ? { chatInput: message.chatInput } : {}),
                        sessionId: message.sessionId,
                    },

                    // Meta re-sends an event until it gets a 200
                    dedupeKey: message.dedupeKey,
                });
            }
        } catch (error) {
            console.error(`${label} webhook error:`, error);

            return NextResponse.json(
                { success: false, error: `Failed to process the ${label} event` },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true });
    };

    return { GET, POST };
};
