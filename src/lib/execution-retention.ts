// How long a user's execution data is kept. No server-only imports: the
// Executions page uses the options too.

export const RETENTION_DAY_OPTIONS = [7, 30, 90] as const;

export type RetentionDays = (typeof RETENTION_DAY_OPTIONS)[number];

export const DEFAULT_RETENTION_DAYS: RetentionDays = 30;

// Anything that is not one of the options counts as the default
export const normalizeRetentionDays = (value: unknown): RetentionDays =>
  RETENTION_DAY_OPTIONS.find((days) => days === Number(value)) ??
  DEFAULT_RETENTION_DAYS;

// Executions started before this moment are past their retention
export const getRetentionCutoff = (days: number, now: Date = new Date()): Date =>
  new Date(now.getTime() - normalizeRetentionDays(days) * 24 * 60 * 60 * 1000);

// The monthly execution limit counts this month's executions, so their rows
// have to stay until the month is over even when their data is deleted
export const getStartOfMonth = (now: Date = new Date()): Date => {
  const start = new Date(now);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  return start;
};

/**
 * What to do with an execution that started at the given time:
 *
 *   keep    still within the retention period
 *   strip   past it, but started this month: its data goes, the row stays
 *           (status, times and error message) so the monthly limit still
 *           counts it
 *   delete  past it and from an earlier month: the whole row goes
 */
export const getRetentionAction = (
  startedAt: Date,
  days: number,
  now: Date = new Date()
): "keep" | "strip" | "delete" => {
  if (startedAt.getTime() >= getRetentionCutoff(days, now).getTime()) return "keep";

  return startedAt.getTime() >= getStartOfMonth(now).getTime() ? "strip" : "delete";
};
