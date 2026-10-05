import { type NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { authenticateApiRequest } from "@/lib/api-keys";

// GET /api/v1/executions?workflowId=...&limit=20: recent executions
export async function GET(request: NextRequest) {
    const auth = await authenticateApiRequest(request);
    if ("response" in auth) return auth.response;

    const query = new URL(request.url).searchParams;
    const workflowId = query.get("workflowId") || undefined;
    const limit = Math.min(Math.max(Number(query.get("limit")) || 20, 1), 100);

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
