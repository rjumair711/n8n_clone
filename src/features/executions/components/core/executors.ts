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
import { markExecutionResumed, markExecutionWaiting } from "../../server/pause";
import { requestApproval } from "@/features/approvals/server/wait";
import { waitForFormSubmission } from "@/features/forms/server/wait";
import { buildFormPage } from "@/lib/form-fields";
import {
  APPROVAL_DEFAULT_TIMEOUT_AMOUNT,
  APPROVAL_DEFAULT_TIMEOUT_UNIT,
} from "@/lib/approvals";
import {
  WAITING_FOR_TIME,
  WAITING_FOR_WEBHOOK,
  WAIT_RESUME_EVENT,
  formatWaitDuration,
  getMaxWaitMs,
  parseWaitDate,
  parseWaitDuration,
  withoutResumeUrl,
} from "@/lib/execution-wait";

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
      // Nor the URL that resumes this run at a Wait node
      body = JSON.stringify(withoutResumeUrl(rest));
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

// =========================================================================
// WAIT
// =========================================================================
type WaitData = {
  variableName?: string;
  // "interval" (default) | "until" | "webhook"
  operation?: string;
  amount?: string;
  unit?: string;
  dateTime?: string;
  // For "form": the page to show (see FormPageData)
  formTitle?: string;
  formDescription?: string;
  formFields?: string;
  submitLabel?: string;
  afterSubmit?: string;
  thankYouMessage?: string;
  redirectUrl?: string;
  // For "webhook": how long to wait for the call. Empty: the maximum.
  timeoutAmount?: string;
  timeoutUnit?: string;
  // "continue" (default) | "fail"
  onTimeout?: string;
};

// How long a form page stays open: the node's Timeout, or the longest wait
const parseFormTimeout = (
  label: string,
  data: { timeoutAmount?: string; timeoutUnit?: string },
  context: WorkflowContext
): number => {
  const timeout = renderTemplate(data.timeoutAmount, context).trim();

  if (!timeout) return getMaxWaitMs();

  try {
    return parseWaitDuration(timeout, data.timeoutUnit, "Timeout");
  } catch (error) {
    throw new NonRetriableError(
      (error instanceof Error ? error.message : "Timeout is not valid").replace(
        /^Wait node:/,
        `${label}:`
      )
    );
  }
};

const WAIT_MODES = ["interval", "until", "webhook", "form"];

type WaitResumeEvent = {
  data?: {
    webhook?: {
      method?: string;
      headers?: Record<string, string>;
      query?: Record<string, string>;
      body?: unknown;
    };
  };
} | null;

/**
 * Pauses the run for an amount of time, until a date, or until its resume
 * URL ({{execution.resumeUrl}}) is called. The pause is an Inngest sleep or
 * wait-for-event, so nothing runs and nothing is held open meanwhile; the
 * execution shows as "Waiting" and can be cancelled.
 */
export const waitExecutor: NodeExecutor<WaitData> = async ({
  data,
  nodeId,
  context,
  step,
  executionId,
  inline,
}) => {
  // An agent's tool call has to answer within the agent's own step
  if (inline) {
    throw new NonRetriableError(
      "Wait node: it cannot be used as an AI Agent tool"
    );
  }

  const variableName = data.variableName?.trim() || "wait";
  const mode = data.operation || "interval";

  if (!WAIT_MODES.includes(mode)) {
    throw new NonRetriableError(`Wait node: Unsupported resume mode "${mode}"`);
  }

  // "On Form Submitted": the page at {{execution.formUrl}}
  if (mode === "form") {
    const result = await waitForFormSubmission({
      step,
      stepId: `wait-${nodeId}-form`,
      label: "Wait node",
      executionId,
      nodeId,
      buildPage: () =>
        buildFormPage(data, (text) => renderTemplate(text, context)),
      timeoutMs: parseFormTimeout("Wait node", data, context),
    });

    if (!result.submitted && data.onTimeout === "fail") {
      throw new NonRetriableError(
        "Wait node: the form was not submitted before the timeout"
      );
    }

    return {
      ...context,
      [variableName]: {
        resumedBy: result.submitted ? "form" : "timeout",
        timedOut: !result.submitted,
        form: result.values,
      },
    };
  }

  // Worked out inside a step, so it is decided once: Inngest re-runs this
  // function after every step, and "now" or {{ $now }} would move each time
  const started = await step.run(`wait-${nodeId}-start`, async () => {
    const now = Date.now();
    const maxMs = getMaxWaitMs();
    let until: number;

    try {
      if (mode === "until") {
        until = parseWaitDate(renderTemplate(data.dateTime, context)).getTime();

        if (until - now > maxMs) {
          throw new Error(
            `Wait node: Date and Time is more than the maximum of ${formatWaitDuration(maxMs)} away`
          );
        }
      } else if (mode === "interval") {
        until =
          now +
          parseWaitDuration(
            renderTemplate(data.amount, context),
            data.unit,
            "Wait Amount",
            maxMs
          );
      } else {
        const timeout = renderTemplate(data.timeoutAmount, context).trim();

        until =
          now +
          (timeout
            ? parseWaitDuration(timeout, data.timeoutUnit, "Timeout", maxMs)
            : maxMs);
      }
    } catch (error) {
      throw new NonRetriableError(
        error instanceof Error ? error.message : "Wait node: invalid settings"
      );
    }

    // A time that has already passed: the run simply goes on
    const skip = mode !== "webhook" && until <= now;

    // Outside an execution (unit tests) there is nothing to mark
    if (!skip && executionId) {
      await markExecutionWaiting({
        executionId,
        nodeId,
        waitingFor: mode === "webhook" ? WAITING_FOR_WEBHOOK : WAITING_FOR_TIME,
        until: new Date(until),
      });
    }

    return { until: new Date(until).toISOString(), skip };
  });

  let resumedBy: "timer" | "webhook" | "timeout" = "timer";
  let webhook: NonNullable<NonNullable<WaitResumeEvent>["data"]>["webhook"];

  if (!started.skip) {
    if (mode === "webhook") {
      const event = (await step.waitForEvent(`wait-${nodeId}-webhook`, {
        event: WAIT_RESUME_EVENT,
        timeout: new Date(started.until),
        // Only the call to this execution's own resume URL
        if: `async.data.executionId == "${executionId ?? ""}"`,
      })) as WaitResumeEvent;

      resumedBy = event ? "webhook" : "timeout";
      webhook = event?.data?.webhook;
    } else {
      await step.sleepUntil(`wait-${nodeId}-sleep`, new Date(started.until));
    }

    if (executionId) {
      await step.run(`wait-${nodeId}-resume`, () =>
        markExecutionResumed({ executionId, nodeId, label: "Wait node" })
      );
    }
  }

  if (resumedBy === "timeout" && data.onTimeout === "fail") {
    throw new NonRetriableError(
      "Wait node: the resume URL was not called before the timeout"
    );
  }

  return {
    ...context,
    [variableName]: {
      resumedBy,
      timedOut: resumedBy === "timeout",
      ...(mode === "webhook"
        ? {
            method: webhook?.method ?? null,
            headers: webhook?.headers ?? {},
            query: webhook?.query ?? {},
            body: webhook?.body ?? null,
          }
        : {}),
    },
  };
};

// =========================================================================
// SEND AND WAIT FOR APPROVAL
// =========================================================================
type ApprovalData = {
  variableName?: string;
  // The channel: "in_app" (default), "email", "slack", "telegram", "whatsapp"
  operation?: string;
  credentialId?: string;
  recipient?: string;
  webhookUrl?: string;
  phoneNumberId?: string;
  title?: string;
  message?: string;
  timeoutAmount?: string;
  timeoutUnit?: string;
  // "reject" (default): leave through the Rejected output. "fail": fail.
  onTimeout?: string;
};

export const APPROVED_OUTPUT = "approved";
export const REJECTED_OUTPUT = "rejected";

/**
 * Asks a person to approve or reject, and pauses the run until they do. The
 * request goes out with signed Approve / Reject links and can always be
 * answered on the Approvals page. The run continues through the Approved or
 * the Rejected output.
 */
export const approvalExecutor: NodeExecutor<ApprovalData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
  executionId,
  inline,
}) => {
  // An agent asks for approval of its tools itself ("Require approval")
  if (inline) {
    throw new NonRetriableError(
      "Send and Wait for Approval node: it cannot be used as an AI Agent tool. Switch on Require approval for the agent's tools instead."
    );
  }

  const label = "Send and Wait for Approval node";
  const variableName = data.variableName?.trim() || "approval";

  let timeoutMs: number;
  try {
    timeoutMs = parseWaitDuration(
      renderTemplate(data.timeoutAmount, context).trim() ||
        APPROVAL_DEFAULT_TIMEOUT_AMOUNT,
      data.timeoutUnit || APPROVAL_DEFAULT_TIMEOUT_UNIT,
      "Timeout"
    );
  } catch (error) {
    throw new NonRetriableError(
      (error instanceof Error ? error.message : "Timeout is not valid").replace(
        /^Wait node:/,
        `${label}:`
      )
    );
  }

  const result = await requestApproval({
    step,
    stepId: `approval-${nodeId}`,
    label,
    executionId,
    nodeId,
    userId,
    kind: "node",
    title: renderTemplate(data.title, context).trim() || "Approval needed",
    details: renderTemplate(data.message, context).trim() || null,
    delivery: {
      channel: data.operation,
      credentialId: data.credentialId,
      recipient: data.recipient,
      webhookUrl: data.webhookUrl,
      phoneNumberId: data.phoneNumberId,
    },
    timeoutMs,
    context,
  });

  if (result.outcome === "expired" && data.onTimeout === "fail") {
    throw new NonRetriableError(
      `${label}: nobody answered before the request expired`
    );
  }

  return {
    ...context,
    [variableName]: {
      approved: result.outcome === "approved",
      // "approved", "rejected" or "expired"
      decision: result.outcome,
      timedOut: result.outcome === "expired",
      decidedVia: result.decidedVia,
      approvalId: result.approvalId,
    },
  };
};

// =========================================================================
// FORM (the next page of a multi-step form)
// =========================================================================
type FormNodeData = {
  variableName?: string;
  formTitle?: string;
  formDescription?: string;
  // The fields, as a JSON string (see lib/form-fields.ts)
  formFields?: string;
  submitLabel?: string;
  // "message" (default) | "redirect"
  afterSubmit?: string;
  thankYouMessage?: string;
  redirectUrl?: string;
  timeoutAmount?: string;
  timeoutUnit?: string;
  // "fail" (default) | "continue"
  onTimeout?: string;
};

/**
 * Shows the next page of a hosted form and waits until it is submitted.
 * The person who submitted the Form Trigger's page is shown this one next;
 * the page is also at {{execution.formUrl}}.
 */
export const formExecutor: NodeExecutor<FormNodeData> = async ({
  data,
  nodeId,
  context,
  step,
  executionId,
  inline,
}) => {
  if (inline) {
    throw new NonRetriableError(
      "Form node: it cannot be used as an AI Agent tool"
    );
  }

  const variableName = data.variableName?.trim() || "formPage";

  const result = await waitForFormSubmission({
    step,
    stepId: `form-${nodeId}`,
    label: "Form node",
    executionId,
    nodeId,
    buildPage: () => buildFormPage(data, (text) => renderTemplate(text, context)),
    timeoutMs: parseFormTimeout("Form node", data, context),
  });

  if (!result.submitted) {
    if (data.onTimeout !== "continue") {
      throw new NonRetriableError(
        "Form node: the page was not submitted before the timeout"
      );
    }

    return { ...context, [variableName]: { timedOut: true } };
  }

  return { ...context, [variableName]: result.values };
};
