import { ExecutionStatus } from "@prisma/client";
import prisma from "@/lib/db";
import {
  WAITING_FOR_FORM,
  WAITING_FOR_FORM_SUBMITTED,
  type FormPage,
} from "@/lib/form-fields";
import type { FormWaitingData } from "./wait";

// What the hosted form is told about the execution it belongs to:
//   page     a form page is waiting to be filled in
//   pending  the workflow is working; a page may come
//   done     the workflow finished
//   failed   the workflow failed or was cancelled
export type FormState =
  | { state: "page"; page: FormPage }
  | { state: "pending" | "done" | "failed" };

export const loadWaitingForm = async (executionId: string) => {
  const execution = await prisma.execution.findUnique({
    where: { id: executionId },
    select: {
      status: true,
      waitingFor: true,
      waitingData: true,
      workflow: { select: { userId: true } },
    },
  });

  if (!execution) return null;

  const waiting =
    execution.status === ExecutionStatus.WAITING &&
    execution.waitingFor === WAITING_FOR_FORM
      ? (execution.waitingData as unknown as FormWaitingData | null)
      : null;

  // Paused for something that is not a form (a time, an approval): no page
  // is about to come, so the form does not keep its visitor waiting
  const pausedElsewhere =
    execution.status === ExecutionStatus.WAITING &&
    execution.waitingFor !== WAITING_FOR_FORM &&
    execution.waitingFor !== WAITING_FOR_FORM_SUBMITTED;

  const state: FormState = waiting?.page
    ? { state: "page", page: waiting.page }
    : execution.status === ExecutionStatus.SUCCESS || pausedElsewhere
      ? { state: "done" }
      : execution.status === ExecutionStatus.FAILED
        ? { state: "failed" }
        : { state: "pending" };

  return {
    state,
    nodeId: waiting?.nodeId ?? null,
    userId: execution.workflow.userId,
  };
};
