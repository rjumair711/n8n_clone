import { NonRetriableError, referenceFunction } from "inngest";
import { ExecutionStatus, NodeType, type Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import type { NodeExecutor, WorkflowContext } from "@/features/executions/types";
import type { StoredWebhookResponse } from "@/lib/webhook-response";
import { TRIGGER_SOURCES } from "@/config/trigger-sources";
import { sendWorkflowExecution } from "@/inngest/utils";
import { renderTemplate } from "../../lib/templates";
import { parseJsonField } from "../../lib/integration";
import { parseKeyValues } from "../../lib/key-values";

// =========================================================================
// TRIGGERS WHOSE DATA IS ALREADY IN THE CONTEXT WHEN THE RUN STARTS
// (Error Trigger, Telegram Trigger, WhatsApp Trigger, Execute Workflow Trigger)
// =========================================================================
export const contextTriggerExecutor: NodeExecutor = async ({ context }) =>
  context;

// =========================================================================
// RESPOND TO WEBHOOK
// =========================================================================
type RespondToWebhookData = {
  // "json" | "text" | "allData" | "noData" | "redirect"
  respondWith?: string;
  responseBody?: string;
  responseCode?: string;
  responseHeaders?: string;
  redirectUrl?: string;
};

/**
 * Answers the HTTP request that started the run. The webhook route is
 * waiting on Execution.webhookResponse when the Webhook trigger's Respond
 * setting is "Using 'Respond to Webhook' Node".
 */
export const respondToWebhookExecutor: NodeExecutor<
  RespondToWebhookData
> = async ({ data, nodeId, context, step, executionId }) => {
  const respondWith = data.respondWith || "json";
  const headers = parseKeyValues(
    "Respond to Webhook",
    "Response Headers",
    renderTemplate(data.responseHeaders, context)
  );

  const hasContentType = Object.keys(headers).some(
    (name) => name.toLowerCase() === "content-type"
  );

  let body: string | null = null;
  let defaultCode = 200;

  switch (respondWith) {
    case "json": {
      const text = renderTemplate(data.responseBody, context).trim() || "{}";
      // Fails here, with a clear message, instead of sending broken JSON
      parseJsonField("Respond to Webhook", "Response Body", text);

      body = text;
      if (!hasContentType) headers["Content-Type"] = "application/json";
      break;
    }

    case "text":
      body = renderTemplate(data.responseBody, context);
      if (!hasContentType) headers["Content-Type"] = "text/plain; charset=utf-8";
      break;

    case "allData": {
      // Everything the workflow has produced so far, without the request
      const { webhook: _webhook, ...rest } = context;
      body = JSON.stringify(rest);
      if (!hasContentType) headers["Content-Type"] = "application/json";
      break;
    }

    case "redirect": {
      const location = renderTemplate(data.redirectUrl, context).trim();
      if (!/^https?:\/\//i.test(location)) {
        throw new NonRetriableError(
          "Respond to Webhook node: Redirect URL must start with http:// or https://"
        );
      }

      headers.Location = location;
      defaultCode = 302;
      break;
    }

    case "noData":
      break;

    default:
      throw new NonRetriableError(
        `Respond to Webhook node: Unsupported response type "${respondWith}"`
      );
  }

  const renderedCode = renderTemplate(data.responseCode, context).trim();
  const statusCode = renderedCode ? Number(renderedCode) : defaultCode;

  if (!Number.isInteger(statusCode) || statusCode < 200 || statusCode > 599) {
    throw new NonRetriableError(
      "Respond to Webhook node: Response Code must be a number between 200 and 599"
    );
  }

  const response: StoredWebhookResponse = { statusCode, headers, body };

  // Outside an execution (AI Agent tool calls in tests) there is no request
  if (executionId) {
    await step.run(`respond-to-webhook-${nodeId}`, async () => {
      await prisma.execution.update({
        where: { id: executionId },
        data: {
          webhookResponse: response as unknown as Prisma.InputJsonValue,
        },
      });
    });
  }

  return context;
};

// =========================================================================
// STOP AND ERROR
// =========================================================================
type StopAndErrorData = {
  errorMessage?: string;
};

export const stopAndErrorExecutor: NodeExecutor<StopAndErrorData> = async ({
  data,
  context,
}) => {
  throw new NonRetriableError(
    renderTemplate(data.errorMessage, context).trim() ||
      "The workflow was stopped by a Stop and Error node"
  );
};

// =========================================================================
// EXECUTE WORKFLOW
// =========================================================================
type ExecuteWorkflowData = {
  variableName?: string;
  workflowId?: string;
  // "all": pass everything this workflow has so far. "define": pass `inputJson`.
  inputMode?: string;
  inputJson?: string;
  // "yes" (default) | "no"
  waitForCompletion?: string;
};

export const EXECUTE_WORKFLOW_MAX_DEPTH = 5;

// Used when the node runs as an AI Agent tool, where step.invoke is not available
const INLINE_POLL_INTERVAL_MS = 500;
const INLINE_TIMEOUT_MS = 120_000;

const waitForExecution = async (executionId: string): Promise<WorkflowContext> => {
  const deadline = Date.now() + INLINE_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, INLINE_POLL_INTERVAL_MS));

    const execution = await prisma.execution.findUnique({
      where: { id: executionId },
      select: { status: true, error: true, output: true },
    });

    if (execution?.status === ExecutionStatus.SUCCESS) {
      return (execution.output ?? {}) as WorkflowContext;
    }

    if (!execution || execution.status === ExecutionStatus.FAILED) {
      throw new NonRetriableError(
        `Execute Workflow node: the sub-workflow failed: ${execution?.error || "unknown error"}`
      );
    }
  }

  throw new NonRetriableError(
    `Execute Workflow node: the sub-workflow did not finish within ${INLINE_TIMEOUT_MS / 1000} seconds`
  );
};

/**
 * Runs another workflow of the same user, starting at its "When Executed by
 * Another Workflow" trigger, and returns what that workflow produced.
 */
export const executeWorkflowExecutor: NodeExecutor<ExecuteWorkflowData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
  executionId,
  inline,
  callDepth = 0,
}) => {
  const variableName = data.variableName?.trim();
  if (!variableName) {
    throw new NonRetriableError("Execute Workflow node: Variable name is missing");
  }

  const targetWorkflowId = renderTemplate(data.workflowId, context).trim();
  if (!targetWorkflowId) {
    throw new NonRetriableError("Execute Workflow node: Workflow is required");
  }

  if (callDepth >= EXECUTE_WORKFLOW_MAX_DEPTH) {
    throw new NonRetriableError(
      `Execute Workflow node: workflows are nested more than ${EXECUTE_WORKFLOW_MAX_DEPTH} levels deep. Check for a workflow that calls itself.`
    );
  }

  let input: WorkflowContext;

  if (data.inputMode === "define") {
    const text = renderTemplate(data.inputJson, context).trim() || "{}";
    const parsed = parseJsonField<unknown>("Execute Workflow", "Workflow Input", text);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new NonRetriableError(
        "Execute Workflow node: Workflow Input must be a JSON object"
      );
    }

    input = parsed as WorkflowContext;
  } else {
    // The agent's arguments are only meaningful inside this tool call
    const { ai: _ai, ...rest } = context;
    input = inline && context.ai ? { ...rest, ...(context.ai as object) } : rest;
  }

  // Creates the Execution row the engine needs before the run starts
  const child = await step.run(`execute-workflow-${nodeId}-prepare`, async () => {
    const workflow = await prisma.workflow.findFirst({
      // Scoped to the owner: never run someone else's workflow
      where: { id: targetWorkflowId, userId },
      select: {
        id: true,
        nodes: {
          where: { type: NodeType.EXECUTE_WORKFLOW_TRIGGER },
          select: { id: true },
        },
      },
    });

    if (!workflow) {
      throw new NonRetriableError("Execute Workflow node: Workflow not found");
    }

    if (workflow.nodes.length === 0) {
      throw new NonRetriableError(
        'Execute Workflow node: the selected workflow has no "When Executed by Another Workflow" trigger. Add one and save that workflow.'
      );
    }

    const execution = await prisma.execution.create({
      data: {
        workflowId: workflow.id,
        status: ExecutionStatus.RUNNING,
        triggerSource: TRIGGER_SOURCES.WORKFLOW,
      },
    });

    return { executionId: execution.id };
  });

  const eventData = {
    workflowId: targetWorkflowId,
    executionId: child.executionId,
    trigger: NodeType.EXECUTE_WORKFLOW_TRIGGER,
    InitialData: input,
    callDepth: callDepth + 1,
    parentExecutionId: executionId,
  };

  const wait = data.waitForCompletion !== "no";

  let result: unknown;

  if (inline) {
    await sendWorkflowExecution(eventData);

    result = wait
      ? await waitForExecution(child.executionId)
      : { executionId: child.executionId, started: true };
  } else if (wait) {
    try {
      const output = await step.invoke(`execute-workflow-${nodeId}-run`, {
        // Referenced by id: importing the function here would be circular
        function: referenceFunction({ functionId: "execute-workflow" }),
        data: eventData,
      });

      result = (output as { result?: WorkflowContext } | null)?.result ?? {};
    } catch (error: any) {
      throw new NonRetriableError(
        `Execute Workflow node: the sub-workflow failed: ${error?.message || "unknown error"}`
      );
    }
  } else {
    await step.run(`execute-workflow-${nodeId}-start`, async () => {
      await sendWorkflowExecution(eventData);
    });

    result = { executionId: child.executionId, started: true };
  }

  return {
    ...context,
    [variableName]: result,
  };
};
