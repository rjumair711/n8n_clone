import { createHmac } from "crypto";
import { secretsMatch } from "./webhook-security";

// What the Wait node and its resume URL share. Nothing here touches the
// database or Inngest, so it can be tested on its own.
//
//   <app>/api/webhooks/wait/<executionId>/<token>
//
// The token is an HMAC-SHA256 of the execution id made with the app's
// ENCRYPTION_KEY, so every execution has its own URL, it cannot be guessed
// from the execution id, and nothing has to be stored for it. Whoever has
// the URL can resume that one execution while it waits for a webhook call.

// Sent by the resume URL; the Wait node's step.waitForEvent listens for it
export const WAIT_RESUME_EVENT = "workflows/wait.resume";
// Sent when a waiting execution is cancelled; stops the Inngest run
export const EXECUTION_CANCEL_EVENT = "workflows/execution.cancel";

// Execution.waitingFor
export const WAITING_FOR_TIME = "time";
export const WAITING_FOR_WEBHOOK = "webhook";

export const EXECUTION_CANCELLED_MESSAGE =
  "Cancelled by the user while it was waiting";

const SECOND = 1000;
const DAY = 24 * 60 * 60 * SECOND;

const UNIT_MS: Record<string, number> = {
  seconds: SECOND,
  minutes: 60 * SECOND,
  hours: 60 * 60 * SECOND,
  days: DAY,
};

export const WAIT_DEFAULT_MAX_DAYS = 7;

/**
 * The longest a Wait node may wait. Inngest's free plan cannot sleep longer
 * than seven days; set WAIT_MAX_DAYS on a plan that can.
 */
export const getMaxWaitMs = () => {
  const days = Number(process.env.WAIT_MAX_DAYS);

  return (Number.isFinite(days) && days > 0 ? days : WAIT_DEFAULT_MAX_DAYS) * DAY;
};

export const formatWaitDuration = (ms: number) => {
  for (const [unit, size] of [
    ["day", DAY],
    ["hour", UNIT_MS.hours],
    ["minute", UNIT_MS.minutes],
  ] as const) {
    if (ms >= size && ms % size === 0) {
      return `${ms / size} ${unit}${ms === size ? "" : "s"}`;
    }
  }

  const seconds = Math.round(ms / SECOND);

  return `${seconds} second${seconds === 1 ? "" : "s"}`;
};

/**
 * An amount and a unit (seconds, minutes, hours or days) as milliseconds.
 * Throws with a message for the user when it is not a time the node can
 * wait for.
 */
export const parseWaitDuration = (
  amount: unknown,
  unit: unknown,
  label: string,
  maxMs: number = getMaxWaitMs()
): number => {
  const text = String(amount ?? "").trim();
  const value = Number(text);

  if (!text || !Number.isFinite(value) || value < 0) {
    throw new Error(`Wait node: ${label} must be a number, 0 or more`);
  }

  const unitMs = UNIT_MS[String(unit || "seconds")];

  if (!unitMs) {
    throw new Error(
      `Wait node: ${label} unit must be seconds, minutes, hours or days`
    );
  }

  const ms = Math.round(value * unitMs);

  if (ms > maxMs) {
    throw new Error(
      `Wait node: ${label} is longer than the maximum of ${formatWaitDuration(maxMs)}`
    );
  }

  return ms;
};

// 2026-12-24T09:00, with or without seconds: a time without a time zone
const LOCAL_DATE_TIME = /^\d{4}-\d\d-\d\d[T ]\d\d:\d\d(:\d\d(\.\d+)?)?$/;

/**
 * The date and time to wait until. A time without a zone is read as UTC, so
 * the same workflow waits until the same moment on every server.
 */
export const parseWaitDate = (value: unknown): Date => {
  const text = String(value ?? "").trim();

  const date = new Date(
    LOCAL_DATE_TIME.test(text) ? `${text.replace(" ", "T")}Z` : text
  );

  if (!text || Number.isNaN(date.getTime())) {
    throw new Error(
      `Wait node: Date and Time must be a date like 2026-12-24T09:00:00Z${text ? `, got "${text.slice(0, 60)}"` : ""}`
    );
  }

  return date;
};

const signingSecrets = (): string[] => {
  const current = process.env.ENCRYPTION_KEY;

  if (!current) {
    throw new Error("ENCRYPTION_KEY is not set");
  }

  // An execution that started waiting before a key change can still be resumed
  const previous = process.env.ENCRYPTION_KEY_PREVIOUS;

  return previous && previous !== current ? [current, previous] : [current];
};

const sign = (secret: string, executionId: string) =>
  createHmac("sha256", secret)
    .update(`wait-resume:${executionId}`)
    .digest("base64url");

export const createResumeToken = (executionId: string) =>
  sign(signingSecrets()[0], executionId);

export const verifyResumeToken = (executionId: string, token: string) => {
  if (!executionId || !token) return false;

  // Every key is compared, so the time taken does not depend on which matched
  let verified = false;
  for (const secret of signingSecrets()) {
    if (secretsMatch(token, sign(secret, executionId))) verified = true;
  }

  return verified;
};

export const buildResumeUrl = (appUrl: string, executionId: string) =>
  `${appUrl}/api/webhooks/wait/${encodeURIComponent(executionId)}/${createResumeToken(executionId)}`;

/**
 * The resume URL of an execution and the secret part of it, or null on a
 * server without ENCRYPTION_KEY (which cannot store credentials either).
 */
export const getResumeLink = (
  appUrl: string,
  executionId: string
): { url: string; token: string } | null => {
  try {
    return {
      url: buildResumeUrl(appUrl, executionId),
      token: createResumeToken(executionId),
    };
  } catch {
    return null;
  }
};

/**
 * Adds {{execution.resumeUrl}} to the data a run starts with, so a node
 * before the Wait node can send the URL out. What a trigger put under
 * `execution` (the Error Trigger's failed run) is kept.
 */
export const withResumeUrl = (
  context: Record<string, unknown>,
  resumeUrl: string | undefined
): Record<string, unknown> => {
  if (!resumeUrl) return context;

  const existing = context.execution;

  return {
    ...context,
    execution: {
      ...(existing !== null && typeof existing === "object" && !Array.isArray(existing)
        ? existing
        : {}),
      resumeUrl,
    },
  };
};

/**
 * The same data without the resume URL, for what is sent to whoever called
 * the workflow's webhook.
 */
export const withoutResumeUrl = (
  context: Record<string, unknown>
): Record<string, unknown> => {
  const existing = context.execution;

  if (existing === null || typeof existing !== "object" || Array.isArray(existing)) {
    return context;
  }

  const { resumeUrl: _resumeUrl, ...execution } = existing as Record<string, unknown>;
  const { execution: _execution, ...rest } = context;

  return Object.keys(execution).length > 0 ? { ...rest, execution } : rest;
};
