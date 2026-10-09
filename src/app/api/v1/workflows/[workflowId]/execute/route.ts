import { type NextRequest, NextResponse } from "next/server";
import { ExecutionStatus, NodeType } from "@prisma/client";
import prisma from "@/lib/db";
import { apiError, authenticateApiRequest } from "@/lib/api-keys";
import { sendWorkflowExecution } from "@/inngest/utils";
import { PLAN_LIMITS } from "@/config/plans";
import { TRIGGER_SOURCES } from "@/config/trigger-sources";

/**
 * POST /api/v1/workflows/:id/execute
 *
 * Runs the workflow from its manual trigger. The JSON object in the request
 * body becomes the run's starting variables. Answers at once with the
 * execution id; poll GET /api/v1/executions/:id for the result.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ workflowId: string }> }
) {
    const auth = await authenticateApiRequest(request, "workflows:execute");
    if ("response" in auth) return auth.response;

    const { workflowId } = await params;

    const workflow = await prisma.workflow.findFirst({
        where: { id: workflowId, userId: auth.user.id },
        select: {
            id: true,
            nodes: {
                where: { type: NodeType.MANUAL_TRIGGER },
                select: { id: true },
            },
        },
    });

    if (!workflow) return apiError(404, "Workflow not found.");

    if (workflow.nodes.length === 0) {
        return apiError(
            400,
            "The workflow has no manual trigger. Add a 'Trigger manually' node and save it."
        );
    }

    let data: Record<string, unknown> = {};
    const text = await request.text();

    if (text.trim()) {
        try {
            const parsed = JSON.parse(text);

            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                return apiError(400, "The request body must be a JSON object.");
            }

            data = parsed;
        } catch {
            return apiError(400, "The request body is not valid JSON.");
        }
    }

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const executionsThisMonth = await prisma.execution.count({
        where: {
            workflow: { userId: auth.user.id },
            startedAt: { gte: startOfMonth },
        },
    });

    const executionLimit = PLAN_LIMITS[auth.user.plan].monthlyExecutions;

    if (executionsThisMonth >= executionLimit) {
        return apiError(
            429,
            `Monthly execution limit reached. Your plan includes ${executionLimit} executions per month.`
        );
    }

    const execution = await prisma.execution.create({
        data: {
            workflowId: workflow.id,
            status: ExecutionStatus.RUNNING,
            triggerSource: TRIGGER_SOURCES.API,
        },
    });

    await sendWorkflowExecution({
        workflowId: workflow.id,
        executionId: execution.id,
        trigger: NodeType.MANUAL_TRIGGER,
        InitialData: data,
    });

    await prisma.user.update({
        where: { id: auth.user.id },
        data: { executionsUsed: { increment: 1 } },
    });

    return NextResponse.json(
        {
            data: {
                executionId: execution.id,
                workflowId: workflow.id,
                status: execution.status,
            },
        },
        { status: 202 }
    );
}
