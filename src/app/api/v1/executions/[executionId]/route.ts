import { type NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { apiError, authenticateApiRequest } from "@/lib/api-keys";

// GET /api/v1/executions/:id: status and, once finished, the result
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ executionId: string }> }
) {
    const auth = await authenticateApiRequest(request, "executions:read");
    if ("response" in auth) return auth.response;

    const { executionId } = await params;

    const execution = await prisma.execution.findFirst({
        where: { id: executionId, workflow: { userId: auth.user.id } },
        select: {
            id: true,
            workflowId: true,
            status: true,
            triggerSource: true,
            startedAt: true,
            completedAt: true,
            durationMs: true,
            error: true,
            output: true,
        },
    });

    if (!execution) return apiError(404, "Execution not found.");

    return NextResponse.json({ data: execution });
}
