import { ExecutionStatus, NodeType } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { findTriggerNodes, startWorkflowExecution } from "@/inngest/utils";
import { rateLimitResponse } from "@/lib/rate-limit";
import { secretsMatch } from "@/lib/webhook-security";
import type { StoredWebhookResponse } from "@/lib/webhook-response";
import {
    MCP_ERRORS,
    MCP_MIN_TOKEN_LENGTH,
    describeRunResult,
    handleMcpBody,
    readBearerToken,
    readMcpTools,
    rpcError,
    type McpServerTool,
    type McpToolResult,
} from "@/lib/mcp-server";

// A workflow as an MCP server (Streamable HTTP):
//
//   <app>/api/mcp/<workflow id>      Authorization: Bearer <token>
//
// Each MCP Server Trigger node of the workflow is one tool. Calling a tool
// runs the workflow from that node, and the request stays open until the
// run has a result.

export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

const POLL_INTERVAL_MS = 400;
const DEFAULT_TIMEOUT_MS = 50_000;

const NO_STORE = { "Cache-Control": "no-store" };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Runs the workflow for one tool call and waits for what it returns
const runTool = async (
    workflowId: string,
    tool: McpServerTool,
    args: Record<string, unknown>
): Promise<McpToolResult> => {
    const execution = await startWorkflowExecution({
        workflowId,
        trigger: NodeType.MCP_SERVER_TRIGGER,
        initialData: {
            mcp: { tool: tool.name, arguments: args, nodeId: tool.nodeId },
        },
    });

    const timeout = Number(process.env.MCP_TOOL_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
        await sleep(POLL_INTERVAL_MS);

        const run = await prisma.execution.findUnique({
            where: { id: execution.id },
            select: { status: true, error: true, output: true, webhookResponse: true },
        });

        if (!run) break;

        const response = run.webhookResponse as unknown as StoredWebhookResponse | null;

        // A Respond to Webhook node answers as soon as it has run
        if (
            response ||
            run.status === ExecutionStatus.SUCCESS ||
            run.status === ExecutionStatus.FAILED ||
            run.status === ExecutionStatus.WAITING
        ) {
            return describeRunResult(
                {
                    status: run.status,
                    executionId: execution.id,
                    error: run.error,
                    output: run.output,
                    hasResponse: !!response,
                    responseBody: response?.body ?? null,
                },
                tool.resultPath
            );
        }
    }

    // The run goes on; the caller is told it has no result yet
    return describeRunResult(
        { status: ExecutionStatus.RUNNING, executionId: execution.id },
        tool.resultPath
    );
};

export async function POST(request: NextRequest, { params }: Params) {
    const { id: workflowId } = await params;

    // Before the token check, so guessing tokens is throttled too
    const limited = await rateLimitResponse(`mcp:${workflowId}`);
    if (limited) return limited;

    const triggerNodes = await findTriggerNodes(
        workflowId,
        NodeType.MCP_SERVER_TRIGGER
    );

    if (triggerNodes.length === 0) {
        return NextResponse.json(
            { error: "Workflow not found, not active, or it has no MCP Server trigger" },
            { status: 404, headers: NO_STORE }
        );
    }

    // A caller is offered the tools of the trigger nodes whose token it has
    const provided = readBearerToken(request.headers.get("authorization"));

    const allowedNodes = triggerNodes.filter((node) => {
        const secret = ((node.data as { secret?: string } | null)?.secret ?? "").trim();

        return secret.length >= MCP_MIN_TOKEN_LENGTH && secretsMatch(provided, secret);
    });

    if (allowedNodes.length === 0) {
        return NextResponse.json(
            { error: "Invalid or missing bearer token" },
            {
                status: 401,
                headers: { ...NO_STORE, "WWW-Authenticate": 'Bearer realm="mcp"' },
            }
        );
    }

    let body: unknown;
    try {
        body = JSON.parse(await request.text());
    } catch {
        return NextResponse.json(
            rpcError(null, MCP_ERRORS.parse, "The request body is not JSON"),
            { status: 400, headers: NO_STORE }
        );
    }

    try {
        const workflow = await prisma.workflow.findUnique({
            where: { id: workflowId },
            select: { name: true },
        });

        const answer = await handleMcpBody(body, {
            name: workflow?.name ?? "RXJ workflow",
            tools: readMcpTools(allowedNodes),
            callTool: (tool, args) => runTool(workflowId, tool, args),
        });

        return answer.body === null
            ? new NextResponse(null, { status: answer.status, headers: NO_STORE })
            : NextResponse.json(answer.body, { status: answer.status, headers: NO_STORE });
    } catch (error) {
        console.error("MCP server error:", error);

        return NextResponse.json(
            rpcError(null, MCP_ERRORS.internal, "The request could not be processed"),
            { status: 500, headers: NO_STORE }
        );
    }
}

// This server answers in the POST response and opens no event stream, which
// the transport lets a server say with 405
const methodNotAllowed = () =>
    NextResponse.json(
        { error: "Send JSON-RPC messages with POST" },
        { status: 405, headers: { ...NO_STORE, Allow: "POST" } }
    );

export { methodNotAllowed as GET, methodNotAllowed as DELETE };
