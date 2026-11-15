import { CronExpressionParser } from "cron-parser";
import { effectiveTimeZone } from "./time-zones";

/**
 * Whether a cron expression fires in the given minute, read on the clock
 * of a time zone: "0 9 * * *" in Asia/Karachi is 04:00 UTC. Throws on an
 * expression that cannot be parsed.
 */
export const isCronDue = (
  cronExpression: string,
  minute: Date,
  timeZone?: string | null,
): boolean => {
  const start = new Date(minute);
  start.setUTCSeconds(0, 0);
  // Look 1 second back from the top of the minute for the next run
  const interval = CronExpressionParser.parse(cronExpression, {
    currentDate: new Date(start.getTime() - 1000),
    tz: effectiveTimeZone(timeZone),
  });
  return interval.next().toDate().getTime() === start.getTime();
};

/** The next few run times, for showing a schedule to its owner. */
export const nextCronRuns = (
  cronExpression: string,
  count: number,
  timeZone?: string | null,
  from: Date = new Date(),
): Date[] => {
  const interval = CronExpressionParser.parse(cronExpression, {
    currentDate: from,
    tz: effectiveTimeZone(timeZone),
  });
  return Array.from({ length: count }, () => interval.next().toDate());
};
