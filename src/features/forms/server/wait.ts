import { NonRetriableError } from "inngest";
import type { Prisma } from "@prisma/client";
import type { StepTools } from "@/features/executions/types";
import {
  markExecutionResumed,
  markExecutionWaiting,
} from "@/features/executions/server/pause";
import {
  FORM_SUBMITTED_EVENT,
  WAITING_FOR_FORM,
  getFormFieldsProblem,
  type FormPage,
} from "@/lib/form-fields";

// What is kept on the execution while a form page is shown
export type FormWaitingData = {
  nodeId: string;
  page: FormPage;
};

/**
 * Shows a form page and pauses the run until it is submitted or the time
 * is up. The pause is an Inngest step.waitForEvent, like the Wait node's:
 * the execution shows as Waiting, nothing runs meanwhile, and it can be
 * cancelled. The page is kept on the execution; the hosted form reads it
 * from there (see /api/forms/wait).
 *
 * Call it at the top level of the workflow function (not inside a step).
 */
export const waitForFormSubmission = async ({
  step,
  stepId,
  label,
  executionId,
  nodeId,
  buildPage,
  timeoutMs,
}: {
  step: StepTools;
  // Unique within the run, e.g. "form-<nodeId>"
  stepId: string;
  // For error messages, e.g. "Form node"
  label: string;
  executionId: string | undefined;
  nodeId: string;
  // Called inside a step, so {{ $now }} and the like are filled in once
  buildPage: () => FormPage;
  timeoutMs: number;
}): Promise<{ submitted: boolean; values: Record<string, unknown> }> => {
  if (!executionId) {
    throw new NonRetriableError(
      `${label}: a form can only be shown inside a workflow execution`
    );
  }

  const started = await step.run(`${stepId}-start`, async () => {
    const page = buildPage();
    const problem = getFormFieldsProblem(page.fields);

    if (problem) {
      throw new NonRetriableError(`${label}: ${problem}`);
    }

    const until = new Date(Date.now() + timeoutMs);
    const data: FormWaitingData = { nodeId, page };

    await markExecutionWaiting({
      executionId,
      nodeId,
      waitingFor: WAITING_FOR_FORM,
      until,
      data: data as unknown as Prisma.InputJsonValue,
    });

    return { until: until.toISOString() };
  });

  const event = (await step.waitForEvent(`${stepId}-wait`, {
    event: FORM_SUBMITTED_EVENT,
    timeout: new Date(started.until),
    // Only this page of this execution
    if: `async.data.executionId == "${executionId}" && async.data.nodeId == "${nodeId}"`,
  })) as { data?: { values?: Record<string, unknown> } } | null;

  await step.run(`${stepId}-resume`, () =>
    markExecutionResumed({ executionId, nodeId, label })
  );

  return { submitted: !!event, values: event?.data?.values ?? {} };
};
