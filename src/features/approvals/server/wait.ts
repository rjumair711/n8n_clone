import { NonRetriableError } from "inngest";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { getAppUrl } from "@/lib/app-url";
import type { StepTools, WorkflowContext } from "@/features/executions/types";
import {
  markExecutionResumed,
  markExecutionWaiting,
} from "@/features/executions/server/pause";
import {
  APPROVAL_DECIDED_EVENT,
  APPROVAL_STATUS,
  WAITING_FOR_APPROVAL,
  clipApprovalTitle,
  formatApprovalDetails,
} from "@/lib/approvals";
import { buildApprovalLinks } from "@/lib/approval-links";
import {
  getApprovalChannel,
  getDeliveryProblem,
  sendApprovalNotification,
  type ApprovalDelivery,
} from "./notify";

export type ApprovalOutcome = "approved" | "rejected" | "expired";

export type ApprovalResult = {
  approvalId: string;
  outcome: ApprovalOutcome;
  // "link" or "app"; null when nobody answered
  decidedVia: string | null;
};

/**
 * Asks a person and pauses the run until they answer or the request
 * expires. The pause is an Inngest step.waitForEvent, like the Wait node's:
 * the execution shows as Waiting, nothing runs meanwhile, and it can be
 * cancelled.
 *
 * Call it at the top level of the workflow function (not inside a step).
 */
export const requestApproval = async ({
  step,
  stepId,
  label,
  executionId,
  nodeId,
  userId,
  kind,
  title,
  details,
  delivery,
  timeoutMs,
  context,
}: {
  step: StepTools;
  // Unique within the run, e.g. "approval-<nodeId>" or "agent-approval-<toolCallId>"
  stepId: string;
  // For error messages, e.g. "AI Agent"
  label: string;
  executionId: string | undefined;
  nodeId: string;
  userId: string;
  kind: "tool" | "node";
  title: string;
  details: unknown;
  delivery: ApprovalDelivery;
  timeoutMs: number;
  context: WorkflowContext;
}): Promise<ApprovalResult> => {
  if (!executionId) {
    throw new NonRetriableError(
      `${label}: an approval can only be asked for inside a workflow execution`
    );
  }

  const problem = getDeliveryProblem(delivery, context);
  if (problem) {
    throw new NonRetriableError(`${label}: ${problem}`);
  }

  const channel = getApprovalChannel(delivery);

  const request = await step.run(`${stepId}-request`, async () => {
    const execution = await prisma.execution.findUnique({
      where: { id: executionId },
      select: { workflow: { select: { name: true } } },
    });

    const expiresAt = new Date(Date.now() + timeoutMs);

    const created = await prisma.approvalRequest.create({
      data: {
        executionId,
        userId,
        nodeId,
        kind,
        title: clipApprovalTitle(title),
        // Stored the way it is shown, cut to size
        details: (details === undefined || details === null
          ? undefined
          : typeof details === "string"
            ? formatApprovalDetails(details)
            : JSON.parse(JSON.stringify(details))) as Prisma.InputJsonValue | undefined,
        channel,
        expiresAt,
      },
      select: { id: true },
    });

    await markExecutionWaiting({
      executionId,
      nodeId,
      waitingFor: WAITING_FOR_APPROVAL,
      until: expiresAt,
    });

    return {
      id: created.id,
      expiresAt: expiresAt.toISOString(),
      workflowName: execution?.workflow.name ?? "Workflow",
    };
  });

  if (channel !== "in_app") {
    await step.run(`${stepId}-notify`, async () => {
      const expiresAt = new Date(request.expiresAt);

      try {
        await sendApprovalNotification({
          delivery,
          // The links are made here and never leave this step
          message: {
            kind,
            title: clipApprovalTitle(title),
            details,
            workflowName: request.workflowName,
            expiresAt,
            ...buildApprovalLinks(getAppUrl(), request.id, expiresAt),
          },
          userId,
          nodeId,
          step,
          context,
        });
      } catch (error) {
        // Nobody was asked: the request is withdrawn and the run fails here
        // instead of waiting for an answer that cannot come
        await prisma.approvalRequest.updateMany({
          where: { id: request.id, status: APPROVAL_STATUS.PENDING },
          data: { status: APPROVAL_STATUS.CANCELLED },
        });
        await markExecutionResumed({ executionId, nodeId, label });

        throw new NonRetriableError(
          `${label}: ${error instanceof Error ? error.message : "the approval request could not be sent"}`
        );
      }
    });
  }

  await step.waitForEvent(`${stepId}-wait`, {
    event: APPROVAL_DECIDED_EVENT,
    timeout: new Date(request.expiresAt),
    // Only the answer to this very request
    if: `async.data.approvalId == "${request.id}"`,
  });

  // The database is what counts, not the event: it also has the answer
  // when the event was lost and the wait simply timed out
  return step.run(`${stepId}-resume`, async (): Promise<ApprovalResult> => {
    await prisma.approvalRequest.updateMany({
      where: { id: request.id, status: APPROVAL_STATUS.PENDING },
      data: { status: APPROVAL_STATUS.EXPIRED },
    });

    const answered = await prisma.approvalRequest.findUnique({
      where: { id: request.id },
      select: { status: true, decidedVia: true },
    });

    // Throws when the execution was cancelled while it waited
    await markExecutionResumed({ executionId, nodeId, label });

    return {
      approvalId: request.id,
      outcome:
        answered?.status === APPROVAL_STATUS.APPROVED
          ? "approved"
          : answered?.status === APPROVAL_STATUS.REJECTED
            ? "rejected"
            : "expired",
      decidedVia: answered?.decidedVia ?? null,
    };
  });
};
