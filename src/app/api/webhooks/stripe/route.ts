import { findTriggerNodes, startWorkflowExecution } from "@/inngest/utils";
import { verifyStripeSignature } from "@/lib/webhook-security";
import { type NextRequest, NextResponse } from "next/server";
import { rateLimitResponse } from "@/lib/rate-limit";
import { NodeType } from "@prisma/client";

export async function POST(request: NextRequest) {
    try {
        const url = new URL(request.url);

        const workflowId =
            url.searchParams.get("workflowId");

        if (!workflowId) {
            return NextResponse.json(
                {
                    success: false,
                    error:
                        "Missing required query parameter: workflowId",
                },
                { status: 400 }
            );
        }

        const limited = await rateLimitResponse(`stripe:${workflowId}`);
        if (limited) return limited;

        const triggerNodes = await findTriggerNodes(
            workflowId,
            NodeType.STRIPE_TRIGGER
        );

        if (triggerNodes.length === 0) {
            return NextResponse.json(
                {
                    success: false,
                    error:
                        "Workflow not found, not active, or it has no Stripe trigger",
                },
                { status: 404 }
            );
        }

        // The signature covers the exact bytes Stripe sent, so read the raw
        // body before parsing it
        const rawBody = await request.text();

        const verified = triggerNodes.some((node) => {
            const signingSecret =
                (node.data as { signingSecret?: string } | null)?.signingSecret;

            return (
                !!signingSecret &&
                verifyStripeSignature({
                    rawBody,
                    signatureHeader: request.headers.get("stripe-signature"),
                    signingSecret: signingSecret.trim(),
                })
            );
        });

        if (!verified) {
            return NextResponse.json(
                {
                    success: false,
                    error:
                        "Invalid Stripe signature. Add the endpoint's signing secret to the Stripe trigger node and save the workflow.",
                },
                { status: 401 }
            );
        }

        const body = JSON.parse(rawBody);

        const stripeData = {
            // Event metadata
            eventId: body.id,
            eventType: body.type,
            timestamp: body.created,
            livemode: body.livemode,
            raw: body.data?.object,
        };

        // Trigger an Inngest Job
        await startWorkflowExecution({
            workflowId,
            trigger: NodeType.STRIPE_TRIGGER,

            initialData: {
                stripe: stripeData,
            },

            // Stripe re-sends an event until it gets a 2xx answer
            dedupeKey: body.id,
        });

        return NextResponse.json(
            { success: true },
            { status: 200 }
        );
    } catch (error) {
        console.error(
            "Stripe webhook error:",
            error
        );

        return NextResponse.json(
            {
                success: false,
                error:
                    "Failed to process Stripe event",
            },
            { status: 500 }
        );
    }
}
