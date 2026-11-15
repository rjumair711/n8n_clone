import "server-only";

import { Resend } from "resend";
import prisma from "./db";
import { getAppUrl } from "./app-url";
import { TRIGGER_SOURCES } from "@/config/trigger-sources";

// An email to the workflow's owner when a run fails, so nobody has to build
// an Error Trigger workflow first. On by default (User.failureAlertEmails),
// switched off in Settings → Profile. Like n8n's error workflows, test runs
// from the editor never send one: their error is already on the screen.
//
// At most one email per workflow an hour (a schedule failing every minute
// sends one), and none when an Error Trigger already handles that
// workflow's failures. Sent with Resend; without RESEND_API_KEY nothing is
// sent.

export const FAILURE_ALERT_WINDOW_MINUTES = 60;

// Runs whose failure the person saw happen, or that are not a workflow
// running by itself. Chat stays in: the website widget's runs are chat
// runs too
const SILENT_SOURCES = new Set<string>([
  TRIGGER_SOURCES.MANUAL,
  TRIGGER_SOURCES.MANUAL_TEST,
  TRIGGER_SOURCES.EVALUATION,
]);

/** Whether a failed run of this kind should be emailed at all. */
export const shouldAlertForSource = (triggerSource: string | null | undefined): boolean =>
  !SILENT_SOURCES.has(triggerSource ?? "");

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const shorten = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** The email's subject and bodies. Pure, so it can be tested. */
export const buildFailureAlertEmail = ({
  workflowName,
  workflowId,
  executionId,
  nodeLabel,
  errorMessage,
  failedAt,
  appUrl,
}: {
  workflowName: string;
  workflowId: string;
  executionId: string;
  nodeLabel: string;
  errorMessage: string;
  failedAt: Date;
  appUrl: string;
}) => {
  const name = shorten(workflowName.replace(/[\r\n]+/g, " ").trim() || "Untitled workflow", 80);
  const error = shorten(errorMessage.trim() || "Unknown error", 1000);
  const executionUrl = `${appUrl}/executions/${encodeURIComponent(executionId)}`;
  const workflowUrl = `${appUrl}/workflows/${encodeURIComponent(workflowId)}`;
  const settingsUrl = `${appUrl}/settings/profile`;
  const when = failedAt.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const quiet = `Further failures of this workflow in the next ${FAILURE_ALERT_WINDOW_MINUTES} minutes are not emailed.`;

  return {
    subject: `Workflow failed: ${name}`,
    text: [
      `Your workflow "${name}" failed at ${when}.`,
      "",
      `Node: ${nodeLabel}`,
      `Error: ${error}`,
      "",
      `See the execution: ${executionUrl}`,
      `Open the workflow: ${workflowUrl}`,
      "",
      quiet,
      `Turn these emails off in Settings: ${settingsUrl}`,
    ].join("\n"),
    html: [
      `<p>Your workflow <strong>${escapeHtml(name)}</strong> failed at ${escapeHtml(when)}.</p>`,
      `<p>Node: ${escapeHtml(nodeLabel)}<br>Error: <code>${escapeHtml(error)}</code></p>`,
      `<p><a href="${escapeHtml(executionUrl)}">See the execution</a> · <a href="${escapeHtml(workflowUrl)}">Open the workflow</a></p>`,
      `<p style="color:#666;font-size:12px">${escapeHtml(quiet)} <a href="${escapeHtml(settingsUrl)}">Turn these emails off in Settings</a>.</p>`,
    ].join(""),
  };
};

/**
 * Claims the one alert of this hour for a workflow. True for the first
 * failure in the window. Shares the rate limiter's table, in one statement,
 * so two failures at once cannot both send.
 */
const claimAlertSlot = async (workflowId: string): Promise<boolean> => {
  const key = `failure-alert:${workflowId}`;
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "rate_limit" ("key", "count", "windowStart")
    VALUES (${key}, 1, LOCALTIMESTAMP)
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "rate_limit"."windowStart" < LOCALTIMESTAMP - make_interval(mins => ${FAILURE_ALERT_WINDOW_MINUTES}::int)
        THEN 1
        ELSE "rate_limit"."count" + 1
      END,
      "windowStart" = CASE
        WHEN "rate_limit"."windowStart" < LOCALTIMESTAMP - make_interval(mins => ${FAILURE_ALERT_WINDOW_MINUTES}::int)
        THEN LOCALTIMESTAMP
        ELSE "rate_limit"."windowStart"
      END
    RETURNING "count"
  `;
  return Number(rows[0]?.count) === 1;
};

/**
 * Sends the failure email if the owner wants it and this hour's alert for
 * the workflow is not used yet. Never throws: a run that failed must not
 * fail differently because its email could not go out.
 */
export const sendFailureAlert = async (input: {
  userId: string;
  workflowId: string;
  workflowName: string;
  executionId: string;
  nodeLabel: string;
  errorMessage: string;
  triggerSource: string | null | undefined;
  handledByErrorTrigger: boolean;
}): Promise<{ sent: boolean; reason?: string }> => {
  try {
    if (input.handledByErrorTrigger) return { sent: false, reason: "error-trigger" };
    if (!shouldAlertForSource(input.triggerSource)) return { sent: false, reason: "source" };
    if (!process.env.RESEND_API_KEY) return { sent: false, reason: "no-email-service" };

    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true, failureAlertEmails: true },
    });
    if (!user?.email || !user.failureAlertEmails) return { sent: false, reason: "off" };

    if (!(await claimAlertSlot(input.workflowId))) return { sent: false, reason: "throttled" };

    const email = buildFailureAlertEmail({ ...input, failedAt: new Date(), appUrl: getAppUrl() });
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: process.env.EMAIL_FROM || "RXJ <onboarding@resend.dev>",
      to: user.email,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });

    if (error) {
      console.error("Failure alert email was not sent:", error.message);
      return { sent: false, reason: "send-failed" };
    }
    return { sent: true };
  } catch (error) {
    console.error("Failure alert error:", error instanceof Error ? error.message : error);
    return { sent: false, reason: "error" };
  }
};
