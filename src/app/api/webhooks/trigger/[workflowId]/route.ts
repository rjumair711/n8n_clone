import { findTriggerNodes, startWorkflowExecution } from "@/inngest/utils";
import { type NextRequest, NextResponse } from "next/server";
import { NodeType } from "@prisma/client";
import { secretsMatch } from "@/lib/webhook-security";
import { rateLimitResponse } from "@/lib/rate-limit";
import {
    WEBHOOK_RESPONSE_MODES,
    waitForWebhookResponse,
    type WebhookResponseMode,
} from "@/lib/webhook-response";

// The request stays open while the workflow prepares its response
export const maxDuration = 60;

const readBody = async (request: NextRequest): Promise<unknown> => {
    if (request.method === "GET" || request.method === "HEAD") {
        return null;
    }

    const contentType = request.headers.get("content-type") || "";
    const text = await request.text();

    if (!text) return null;

    if (contentType.includes("application/json")) {
        return JSON.parse(text);
    }

    if (contentType.includes("application/x-www-form-urlencoded")) {
        return Object.fromEntries(new URLSearchParams(text));
    }

    return text;
};

async function handler(
    request: NextRequest,
    { params }: { params: Promise<{ workflowId: string }> }
) {
    try {
        const { workflowId } = await params;
        const url = new URL(request.url);

        // Before the secret check, so guessing secrets is throttled too
        const limited = await rateLimitResponse(`webhook:${workflowId}`);
        if (limited) return limited;

        const triggerNodes = await findTriggerNodes(
            workflowId,
            NodeType.WEBHOOK_TRIGGER
        );

        if (triggerNodes.length === 0) {
            return NextResponse.json(
                {
                    success: false,
                    error:
                        "Workflow not found, not active, or it has no Webhook trigger",
                },
                { status: 404 }
            );
        }

        // Each Webhook trigger node carries its own secret
        const provided =
            request.headers.get("x-webhook-secret") ||
            url.searchParams.get("secret") ||
            "";

        const triggerNode = triggerNodes.find((node) => {
            const secret = (node.data as { secret?: string } | null)?.secret;

            return !!secret && secretsMatch(provided, secret);
        });

        if (!triggerNode) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Invalid or missing webhook secret",
                },
                { status: 401 }
            );
        }

        let body: unknown;
        try {
            body = await readBody(request);
        } catch {
            return NextResponse.json(
                {
                    success: false,
                    error: "Request body is not valid JSON",
                },
                { status: 400 }
            );
        }

        const query = Object.fromEntries(url.searchParams);
        delete query.secret;

        const headers = Object.fromEntries(request.headers);
        delete headers["x-webhook-secret"];
        delete headers.cookie;
        delete headers.authorization;

        // Trigger an Inngest Job
        const execution = await startWorkflowExecution({
            workflowId,
            trigger: NodeType.WEBHOOK_TRIGGER,

            initialData: {
                webhook: {
                    method: request.method,
                    headers,
                    query,
                    body,
                },
            },

            // Optional: a caller that retries can send the same key again
            // without starting the workflow twice
            dedupeKey:
                request.headers.get("idempotency-key") ||
                request.headers.get("x-idempotency-key"),
        });

        if (execution.duplicate) {
            return NextResponse.json(
                {
                    success: true,
                    duplicate: true,
                    executionId: execution.id || null,
                },
                { status: 200 }
            );
        }

        const configuredMode = (
            triggerNode.data as { responseMode?: WebhookResponseMode } | null
        )?.responseMode;

        const responseMode =
            configuredMode && WEBHOOK_RESPONSE_MODES.includes(configuredMode)
                ? configuredMode
                : "immediately";

        if (responseMode !== "immediately") {
            return await waitForWebhookResponse(execution.id, responseMode);
        }

        return NextResponse.json(
            { success: true, executionId: execution.id },
            { status: 200 }
        );
    } catch (error) {
        console.error(
            "Webhook trigger error:",
            error
        );

        return NextResponse.json(
            {
                success: false,
                error:
                    "Failed to process webhook",
            },
            { status: 500 }
        );
    }
}

export {
    handler as GET,
    handler as POST,
    handler as PUT,
    handler as PATCH,
    handler as DELETE,
};
