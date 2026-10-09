import { type NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { apiError, authenticateApiRequest } from "@/lib/api-keys";
import { NotFoundError, assertOwnership } from "@/lib/ownership";

// GET /api/v1/executions?workflowId=...&limit=20: recent executions
export async function GET(request: NextRequest) {
    const auth = await authenticateApiRequest(request, "executions:read");
    if ("response" in auth) return auth.response;

    const query = new URL(request.url).searchParams;
    const workflowId = query.get("workflowId") || undefined;
    const limit = Math.min(Math.max(Number(query.get("limit")) || 20, 1), 100);

    // Asking for another account's workflow is "not found", not an empty list
    if (workflowId) {
        try {
            assertOwnership(
                await prisma.workflow.findUnique({
                    where: { id: workflowId },
                    select: { userId: true },
                }),
                auth.user.id,
                "Workflow"
            );
        } catch (error) {
            if (error instanceof NotFoundError) return apiError(404, error.message);
            throw error;
        }
    }

    const executions = await prisma.execution.findMany({
        where: {
            workflow: { userId: auth.user.id },
            ...(workflowId ? { workflowId } : {}),
        },
        orderBy: { startedAt: "desc" },
        take: limit,
        select: {
            id: true,
            workflowId: true,
            status: true,
            triggerSource: true,
            startedAt: true,
            completedAt: true,
            durationMs: true,
            error: true,
        },
    });

    return NextResponse.json({ data: executions });
}
