import { ExecutionStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import prisma from "@/lib/db";

// What the Webhook trigger's "Respond" setting can be
export const WEBHOOK_RESPONSE_MODES = [
    "immediately",
    "lastNode",
    "responseNode",
] as const;

export type WebhookResponseMode = (typeof WEBHOOK_RESPONSE_MODES)[number];

// Written to Execution.webhookResponse by the Respond to Webhook node
export type StoredWebhookResponse = {
    statusCode: number;
    headers: Record<string, string>;
    // null means "no body"
    body: string | null;
};

const POLL_INTERVAL_MS = 400;
const DEFAULT_TIMEOUT_MS = 25_000;

// Headers a workflow may not set on a response served from this app's origin
const FORBIDDEN_RESPONSE_HEADERS = new Set([
    "set-cookie",
    "content-security-policy",
    "content-length",
    "transfer-encoding",
    "connection",
]);

/**
 * Workflow authors control this response, and it is served from the app's
 * own origin. The sandbox policy stops a response with HTML from running
 * scripts with access to the app's cookies.
 */
const SAFETY_HEADERS = {
    "Content-Security-Policy": "sandbox",
    "X-Content-Type-Options": "nosniff",
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const toResponse = (stored: StoredWebhookResponse) => {
    const headers = new Headers();

    for (const [name, value] of Object.entries(stored.headers || {})) {
        if (FORBIDDEN_RESPONSE_HEADERS.has(name.toLowerCase())) continue;

        try {
            headers.set(name, String(value));
        } catch {
            // Not a valid header name or value: leave it out
        }
    }

    for (const [name, value] of Object.entries(SAFETY_HEADERS)) {
        headers.set(name, value);
    }

    const status =
        Number.isInteger(stored.statusCode) &&
        stored.statusCode >= 200 &&
        stored.statusCode <= 599
            ? stored.statusCode
            : 200;

    // These statuses cannot carry a body
    const body = [204, 205, 304].includes(status) ? null : stored.body;

    return new NextResponse(body, { status, headers });
};

/**
 * Holds the webhook request open until the workflow answers it, like n8n's
 * "Using 'Respond to Webhook' Node" and "When Last Node Finishes".
 */
export const waitForWebhookResponse = async (
    executionId: string,
    mode: Exclude<WebhookResponseMode, "immediately">
): Promise<NextResponse> => {
    const timeout =
        Number(process.env.WEBHOOK_RESPONSE_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
        await sleep(POLL_INTERVAL_MS);

        const execution = await prisma.execution.findUnique({
            where: { id: executionId },
            select: {
                status: true,
                error: true,
                output: true,
                webhookResponse: true,
            },
        });

        if (!execution) break;

        if (mode === "responseNode" && execution.webhookResponse) {
            return toResponse(
                execution.webhookResponse as unknown as StoredWebhookResponse
            );
        }

        if (execution.status === ExecutionStatus.FAILED) {
            return NextResponse.json(
                {
                    success: false,
                    executionId,
                    error: execution.error || "The workflow failed",
                },
                { status: 500, headers: SAFETY_HEADERS }
            );
        }

        if (execution.status === ExecutionStatus.SUCCESS) {
            if (mode === "responseNode") {
                return NextResponse.json(
                    {
                        success: true,
                        executionId,
                        message:
                            "The workflow finished without running a Respond to Webhook node",
                    },
                    { status: 200, headers: SAFETY_HEADERS }
                );
            }

            // The request itself is not part of the answer
            const { webhook: _webhook, ...data } = (execution.output ?? {}) as Record<
                string,
                unknown
            >;

            return NextResponse.json(data, {
                status: 200,
                headers: SAFETY_HEADERS,
            });
        }
    }

    // The workflow keeps running; the caller can look the execution up later
    return NextResponse.json(
        {
            success: true,
            executionId,
            message: `The workflow is still running after ${Math.round(timeout / 1000)} seconds`,
        },
        { status: 202, headers: SAFETY_HEADERS }
    );
};
