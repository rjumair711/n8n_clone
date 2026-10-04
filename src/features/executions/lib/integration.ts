import { NonRetriableError } from "inngest";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import type { StepTools } from "../types";

/**
 * Loads a credential owned by the workflow's user and returns its secret.
 * Only the encrypted row passes through the step, so the plain secret is
 * never stored in Inngest's step state.
 */
export const loadCredentialSecret = async ({
  step,
  stepId,
  credentialId,
  userId,
  label,
}: {
  step: StepTools;
  stepId: string;
  credentialId?: string;
  userId: string;
  label: string;
}): Promise<string> => {
  if (!credentialId) {
    throw new NonRetriableError(`${label} node: Credential is required`);
  }

  const credential = await step.run(stepId, async () => {
    return prisma.credential.findUnique({
      where: {
        id: credentialId,
        userId,
      },
    });
  });

  if (!credential) {
    throw new NonRetriableError(`${label} node: Credential not found`);
  }

  return decrypt(credential.value).trim();
};

export const parseJsonField = <T = unknown>(
  label: string,
  fieldName: string,
  text: string
): T => {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new NonRetriableError(
      `${label} node: Invalid JSON in the ${fieldName} field`
    );
  }
};

/**
 * Turns a failed API call into a readable, non-retriable error. `ky` puts
 * the response on the error; most APIs explain the problem in the body.
 */
export const toIntegrationError = async (
  label: string,
  error: any
): Promise<NonRetriableError> => {
  if (error instanceof NonRetriableError) return error;

  if (error?.response) {
    const body = await error.response
      .clone()
      .json()
      .catch(() => ({}));

    const detail =
      body?.error?.message ||
      body?.message ||
      (typeof body?.error === "string" ? body.error : "") ||
      error.message;

    return new NonRetriableError(
      `${label} API error [${error.response.status}]: ${detail}`
    );
  }

  return new NonRetriableError(`${label} node failed: ${error?.message}`);
};
