import { createHmac } from "crypto";
import { secretsMatch } from "./webhook-security";
import { isApprovalDecision, type ApprovalDecision } from "./approvals";

// The Approve and Reject links of an approval request:
//
//   <app>/api/approvals/<id>?decision=approve&expires=<unix seconds>&signature=<HMAC-SHA256>
//
// The link opens a page that asks for a confirmation; only pressing its
// button answers the request, so a mail scanner that opens the link does
// not approve anything. The signature covers the request id, the decision
// and the expiry time and is made with the app's ENCRYPTION_KEY. A request
// is answered once: that is kept in the database, not in the link.

const signingSecrets = (): string[] => {
  const current = process.env.ENCRYPTION_KEY;

  if (!current) {
    throw new Error("ENCRYPTION_KEY is not set");
  }

  // A request sent just before a key change can still be answered
  const previous = process.env.ENCRYPTION_KEY_PREVIOUS;

  return previous && previous !== current ? [current, previous] : [current];
};

const sign = (
  secret: string,
  approvalId: string,
  decision: ApprovalDecision,
  expires: number
) =>
  createHmac("sha256", secret)
    .update(`approval:${approvalId}:${decision}:${expires}`)
    .digest("base64url");

const toUnixSeconds = (date: Date) => Math.floor(date.getTime() / 1000);

export const buildApprovalUrl = (
  appUrl: string,
  approvalId: string,
  decision: ApprovalDecision,
  expiresAt: Date
) => {
  const expires = toUnixSeconds(expiresAt);
  const signature = sign(signingSecrets()[0], approvalId, decision, expires);

  return `${appUrl}/api/approvals/${encodeURIComponent(approvalId)}?decision=${decision}&expires=${expires}&signature=${signature}`;
};

export const buildApprovalLinks = (
  appUrl: string,
  approvalId: string,
  expiresAt: Date
) => ({
  approveUrl: buildApprovalUrl(appUrl, approvalId, "approve", expiresAt),
  rejectUrl: buildApprovalUrl(appUrl, approvalId, "reject", expiresAt),
});

export type ApprovalLinkCheck = "valid" | "expired" | "invalid";

/**
 * Checks an Approve or Reject link.
 *
 *   valid     signed by this app for this request and decision, not expired
 *   expired   signed by this app, but past its time
 *   invalid   anything else: changed, for another request, or for the other
 *             decision (a Reject link cannot be turned into an Approve link)
 */
export const verifyApprovalLink = (
  approvalId: string,
  decision: unknown,
  expiresParam: string | null | undefined,
  signatureParam: string | null | undefined,
  now: number = Date.now()
): ApprovalLinkCheck => {
  if (
    !approvalId ||
    !isApprovalDecision(decision) ||
    !expiresParam ||
    !signatureParam ||
    !/^\d{1,12}$/.test(expiresParam)
  ) {
    return "invalid";
  }

  const expires = Number(expiresParam);

  // Every key is compared, so the time taken does not depend on which matched
  let matches = false;
  for (const secret of signingSecrets()) {
    if (secretsMatch(signatureParam, sign(secret, approvalId, decision, expires))) {
      matches = true;
    }
  }

  if (!matches) return "invalid";

  return expires * 1000 >= now ? "valid" : "expired";
};
