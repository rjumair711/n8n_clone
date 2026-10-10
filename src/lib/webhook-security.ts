import { createHash, createHmac, timingSafeEqual } from "crypto";

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

/**
 * The one comparison for secrets, tokens and signatures. Constant-time, so
 * what was provided cannot be guessed a character at a time from how long
 * the answer takes.
 *
 * Both sides are hashed first: timingSafeEqual needs inputs of the same
 * length, and comparing lengths up front would tell a caller how long the
 * real secret is. An empty expected value never matches.
 */
export const secretsMatch = (provided: string, expected: string) => {
    if (typeof provided !== "string" || typeof expected !== "string") return false;
    if (!expected) return false;

    return timingSafeEqual(digest(provided), digest(expected));
};

// How old (or how far in the future) a signed webhook may be. A request
// that was captured cannot be sent again later.
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

/**
 * Whether a point in time is within the tolerance of now, either way: the
 * sender's clock may be a little ahead. Anything that is not a time is not.
 */
export const isRecentTimestamp = (
    timestampMs: number,
    now: number = Date.now(),
    toleranceSeconds: number = WEBHOOK_TOLERANCE_SECONDS
): boolean =>
    Number.isFinite(timestampMs) &&
    Math.abs(now - timestampMs) <= toleranceSeconds * 1000;

/**
 * Verifies Stripe's `Stripe-Signature` header:
 *   t=<timestamp>,v1=<HMAC-SHA256 of "<timestamp>.<raw body>">
 * using the endpoint's signing secret (whsec_...). Old timestamps are
 * rejected so a captured request cannot be replayed later.
 */
export const verifyStripeSignature = ({
    rawBody,
    signatureHeader,
    signingSecret,
    now = Date.now(),
}: {
    rawBody: string;
    signatureHeader: string | null;
    signingSecret: string;
    now?: number;
}): boolean => {
    if (!signatureHeader || !signingSecret) return false;

    let timestamp = "";
    const signatures: string[] = [];

    for (const part of signatureHeader.split(",")) {
        const [key, value] = part.split("=", 2);

        if (key?.trim() === "t") timestamp = value?.trim() ?? "";
        if (key?.trim() === "v1" && value) signatures.push(value.trim());
    }

    if (!/^\d+$/.test(timestamp) || signatures.length === 0) return false;

    // The timestamp is part of what is signed, so it cannot be changed
    if (!isRecentTimestamp(Number(timestamp) * 1000, now)) return false;

    const expected = createHmac("sha256", signingSecret)
        .update(`${timestamp}.${rawBody}`, "utf8")
        .digest("hex");

    // Every candidate is compared, so the time taken does not depend on
    // which one matched
    let verified = false;
    for (const signature of signatures) {
        if (secretsMatch(signature, expected)) verified = true;
    }

    return verified;
};

/**
 * Verifies Typeform's `Typeform-Signature` header:
 *   "sha256=" + base64(HMAC-SHA256(raw body, secret))
 */
export const verifyTypeformSignature = ({
    rawBody,
    signatureHeader,
    secret,
}: {
    rawBody: string;
    signatureHeader: string | null;
    secret: string;
}): boolean => {
    if (!signatureHeader || !secret) return false;

    const expected = `sha256=${createHmac("sha256", secret)
        .update(rawBody, "utf8")
        .digest("base64")}`;

    return secretsMatch(signatureHeader, expected);
};

/**
 * Typeform's signature has no timestamp of its own. The time the form was
 * submitted is inside the signed body (`form_response.submitted_at`), so it
 * cannot be altered either and is used the same way: a submission older
 * than the tolerance is refused, and one without a readable time too.
 *
 * Only call this for a body whose signature was verified.
 */
export const isRecentTypeformEvent = (body: unknown, now: number = Date.now()): boolean => {
    const submittedAt = (body as { form_response?: { submitted_at?: unknown } } | null)
        ?.form_response?.submitted_at;

    if (typeof submittedAt !== "string" || !submittedAt.trim()) return false;

    return isRecentTimestamp(Date.parse(submittedAt), now);
};
