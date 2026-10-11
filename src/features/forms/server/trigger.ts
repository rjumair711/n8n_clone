import { NodeType } from "@prisma/client";
import prisma from "@/lib/db";
import {
  buildFormPage,
  getFormFieldsProblem,
  type FormPage,
} from "@/lib/form-fields";
import { getTurnstileConfig } from "@/lib/turnstile";

export type HostedTriggerForm = {
  workflowId: string;
  // The workflow's owner: uploaded files are stored for them
  userId: string;
  page: FormPage;
  // Set when the form asks for a CAPTCHA and the server has Turnstile keys
  captcha: { siteKey: string; secretKey: string } | null;
};

/**
 * The form behind /forms/<id>: a Form Trigger node of an active workflow.
 * Null when there is none, the workflow is switched off, or the form has
 * nothing to show.
 */
export const loadTriggerForm = async (
  formId: string
): Promise<HostedTriggerForm | null> => {
  const node = await prisma.node.findFirst({
    where: {
      id: formId,
      type: NodeType.FORM_TRIGGER,
      workflow: { active: true },
    },
    select: {
      data: true,
      workflowId: true,
      workflow: { select: { userId: true } },
    },
  });

  if (!node) return null;

  const data = (node.data ?? {}) as Record<string, unknown>;
  const page = buildFormPage(data);

  if (getFormFieldsProblem(page.fields)) return null;

  return {
    workflowId: node.workflowId,
    userId: node.workflow.userId,
    page,
    // Without both keys on the server the form works without the check
    captcha: data.captcha === "true" ? getTurnstileConfig() : null,
  };
};

/**
 * Whether a run of the workflow can show another form page (a Form node, or
 * a Wait node set to "On Form Submitted"), so the hosted form knows to wait
 * for it instead of saying thank you straight away.
 */
export const workflowHasFormPages = async (workflowId: string) => {
  const nodes = await prisma.node.findMany({
    where: {
      workflowId,
      type: { in: [NodeType.FORM, NodeType.WAIT] },
    },
    select: { type: true, data: true },
  });

  return nodes.some(
    (node) =>
      node.type === NodeType.FORM ||
      (node.data as { operation?: unknown } | null)?.operation === "form"
  );
};
