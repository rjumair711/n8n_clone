import { findTriggerNodes, startWorkflowExecution } from "@/inngest/utils";
import { type NextRequest, NextResponse } from "next/server";
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

        const body = await request.json();

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
