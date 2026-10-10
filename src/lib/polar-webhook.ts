import { WebhookVerificationError, validateEvent } from "@polar-sh/sdk/webhooks";

export type PolarWebhookCheck =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Checks that a request to the Polar webhook really comes from Polar. Polar
 * signs the raw body with the endpoint's secret (Standard Webhooks:
 * the webhook-id, webhook-timestamp and webhook-signature headers), and the
 * check also refuses a timestamp more than five minutes off.
 *
 * Anything but a verified, well-formed event is refused: a missing secret,
 * a missing or wrong signature, an old timestamp, and a body Polar's SDK
 * cannot read.
 */
export const verifyPolarWebhook = ({
  rawBody,
  headers,
  secret,
}: {
  rawBody: string;
  headers: { get(name: string): string | null };
  secret: string | undefined;
}): PolarWebhookCheck => {
  if (!secret?.trim()) {
    return {
      ok: false,
      status: 503,
      error: "The Polar webhook is not configured: POLAR_WEBHOOK_SECRET is not set.",
    };
  }

  try {
    validateEvent(
      rawBody,
      {
        "webhook-id": headers.get("webhook-id") ?? "",
        "webhook-timestamp": headers.get("webhook-timestamp") ?? "",
        "webhook-signature": headers.get("webhook-signature") ?? "",
      },
      secret.trim()
    );

    return { ok: true };
  } catch (error) {
    return error instanceof WebhookVerificationError
      ? { ok: false, status: 403, error: "Invalid Polar webhook signature." }
      : { ok: false, status: 400, error: "The Polar event could not be read." };
  }
};
