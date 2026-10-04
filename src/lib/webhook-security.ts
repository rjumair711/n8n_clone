import { createHmac, timingSafeEqual } from "crypto";

// Constant-time comparison, so the secret cannot be guessed from timing
export const secretsMatch = (provided: string, expected: string) => {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);

    return a.length === b.length && timingSafeEqual(a, b);
};

const STRIPE_TOLERANCE_SECONDS = 5 * 60;

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

    if (!timestamp || signatures.length === 0) return false;

    const ageSeconds = Math.abs(now / 1000 - Number(timestamp));
    if (!Number.isFinite(ageSeconds) || ageSeconds > STRIPE_TOLERANCE_SECONDS) {
        return false;
    }

    const expected = createHmac("sha256", signingSecret)
        .update(`${timestamp}.${rawBody}`, "utf8")
        .digest("hex");

    return signatures.some((signature) => secretsMatch(signature, expected));
};
