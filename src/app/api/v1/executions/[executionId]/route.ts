import { type NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { apiError, authenticateApiRequest } from "@/lib/api-keys";
import { NotFoundError, assertOwnership } from "@/lib/ownership";

// GET /api/v1/executions/:id: status and, once finished, the result
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ executionId: string }> }
) {
    const auth = await authenticateApiRequest(request, "executions:read");
    if ("response" in auth) return auth.response;

    const { executionId } = await params;

    const found = await prisma.execution.findUnique({
        where: { id: executionId },
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
            workflow: { select: { userId: true } },
        },
    });

    try {
        const { workflow: _workflow, ...execution } = assertOwnership(
            found,
            auth.user.id,
            "Execution",
            (owned) => owned.workflow.userId
        );

        return NextResponse.json({ data: execution });
    } catch (error) {
        if (error instanceof NotFoundError) return apiError(404, error.message);
        throw error;
    }
}
