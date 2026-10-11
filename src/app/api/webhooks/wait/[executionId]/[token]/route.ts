import { type NextRequest, NextResponse } from "next/server";
import { ExecutionStatus } from "@prisma/client";
import prisma from "@/lib/db";
import { inngest } from "@/inngest/client";
import { rateLimitResponse } from "@/lib/rate-limit";
import {
    WAITING_FOR_WEBHOOK,
    WAIT_RESUME_EVENT,
    verifyResumeToken,
} from "@/lib/execution-wait";

// The resume URL of a Wait node set to "On Webhook Call":
//   <app>/api/webhooks/wait/<executionId>/<token>
// Calling it continues that one execution, with what was sent available to
// the nodes after the Wait node.

const notFound = () =>
    NextResponse.json(
        { success: false, error: "This resume URL is not valid" },
        { status: 404 }
    );

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
    { params }: { params: Promise<{ executionId: string; token: string }> }
) {
    try {
        const { executionId, token } = await params;

        // Needs no database, so a guessed URL costs nothing
        if (!verifyResumeToken(executionId, token)) {
            return notFound();
        }

        const limited = await rateLimitResponse(`wait:${executionId}`);
        if (limited) return limited;

        const execution = await prisma.execution.findUnique({
            where: { id: executionId },
            select: { status: true, waitingFor: true },
        });

        if (!execution) {
            return notFound();
        }

        if (
            execution.status !== ExecutionStatus.WAITING ||
            execution.waitingFor !== WAITING_FOR_WEBHOOK
        ) {
            return NextResponse.json(
                {
                    success: false,
                    executionId,
                    error:
                        execution.status === ExecutionStatus.RUNNING
                            ? "This execution has not reached its Wait node yet, or it has already been resumed"
                            : "This execution is not waiting for a webhook call",
                },
                { status: 409 }
            );
        }

        let body: unknown;
        try {
            body = await readBody(request);
        } catch {
            return NextResponse.json(
                { success: false, error: "Request body is not valid JSON" },
                { status: 400 }
            );
        }

        const headers = Object.fromEntries(request.headers);
        delete headers.cookie;
        delete headers.authorization;

        // The Wait node's step.waitForEvent is listening for this
        await inngest.send({
            name: WAIT_RESUME_EVENT,
            data: {
                executionId,
                webhook: {
                    method: request.method,
                    headers,
                    query: Object.fromEntries(new URL(request.url).searchParams),
                    body,
                },
            },
        });

        return NextResponse.json(
            {
                success: true,
                executionId,
                message: "The workflow continues",
            },
            { status: 200 }
        );
    } catch (error) {
        // Never the URL: its last part is the secret
        console.error(
            "Wait resume error:",
            error instanceof Error ? error.message : error
        );

        return NextResponse.json(
            { success: false, error: "Failed to resume the execution" },
            { status: 500 }
        );
    }
}

export {
    handler as GET,
    handler as POST,
    handler as PUT,
    handler as PATCH,
};
