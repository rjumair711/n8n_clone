import { type NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { authenticateApiRequest } from "@/lib/api-keys";

// GET /api/v1/workflows: the caller's workflows
export async function GET(request: NextRequest) {
    const auth = await authenticateApiRequest(request, "workflows:read");
    if ("response" in auth) return auth.response;

    const workflows = await prisma.workflow.findMany({
        where: { userId: auth.user.id },
        orderBy: { updatedAt: "desc" },
        select: {
            id: true,
            name: true,
            active: true,
            createdAt: true,
            updatedAt: true,
        },
    });

    return NextResponse.json({ data: workflows });
}
