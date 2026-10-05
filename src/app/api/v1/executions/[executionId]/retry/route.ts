import { type NextRequest, NextResponse } from "next/server";
import { apiError, authenticateApiRequest } from "@/lib/api-keys";
import { RetryError, retryExecution } from "@/features/executions/server/retry";

// POST /api/v1/executions/:id/retry: run it again with the same starting data
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ executionId: string }> }
) {
    const auth = await authenticateApiRequest(request);
    if ("response" in auth) return auth.response;

    const { executionId } = await params;

    try {
        const retried = await retryExecution(executionId, auth.user.id);

        return NextResponse.json(
            {
                data: {
                    executionId: retried.id,
                    workflowId: retried.workflowId,
                    retryOf: retried.retryOf,
                    status: "RUNNING",
                },
            },
            { status: 202 }
        );
    } catch (error) {
        if (error instanceof RetryError) {
            return apiError(
                error.reason === "not_found" ? 404 : error.reason === "limit" ? 429 : 400,
                error.message
            );
        }

        throw error;
    }
}
