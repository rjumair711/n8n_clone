// The admin Errors page: failed runs per customer, and the same error
// grouped across customers. No server-only imports: pure rules, tested
// without a database (src/inngest/__test__/testCoreNodes.ts).

export const ERROR_RANGES = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
} as const;

export type ErrorRange = keyof typeof ERROR_RANGES;

// The most failed runs one page reads (newest first)
export const ERRORS_MAX_RUNS = 1000;

export type FailedRun = {
  id: string;
  startedAt: Date;
  workflowId: string;
  workflowName: string;
  user: { id: string; name: string; email: string };
  nodeName: string | null;
  nodeType: string | null;
  error: string | null;
};

/**
 * The part of an error message that says what went wrong, without what
 * differs from run to run (ids, numbers, quoted values), so the same
 * problem groups together: `Request failed with status 401 for "abc"` and
 * `... status 401 for "xyz"` are one error.
 */
export const normalizeErrorMessage = (message: string | null | undefined): string => {
  const firstLine = (message ?? "").split(/\r?\n/).find((line) => line.trim())?.trim() ?? "";
  if (!firstLine) return "No error message";

  return firstLine
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/\b(?=[a-z0-9]*\d)[a-z0-9]{20,}\b/gi, "<id>")
    .replace(/"[^"]{1,200}"|'[^']{1,200}'|`[^`]{1,200}`/g, '"…"')
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/\b\d{5,}\b/g, "<n>")
    .replace(/\s+/g, " ")
    .slice(0, 200);
};

export type CustomerErrors = {
  user: FailedRun["user"];
  failedRuns: number;
  workflows: number;
  lastFailedAt: Date;
  runs: FailedRun[];
};

/** Each customer with their failed runs, the most failing first. */
export const groupByCustomer = (runs: FailedRun[], runsPerCustomer = 20): CustomerErrors[] => {
  const customers = new Map<string, { user: FailedRun["user"]; runs: FailedRun[] }>();
  for (const run of runs) {
    const entry = customers.get(run.user.id) ?? { user: run.user, runs: [] };
    entry.runs.push(run);
    customers.set(run.user.id, entry);
  }

  return [...customers.values()]
    .map(({ user, runs: own }) => {
      const sorted = [...own].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
      return {
        user,
        failedRuns: own.length,
        workflows: new Set(own.map((run) => run.workflowId)).size,
        lastFailedAt: sorted[0].startedAt,
        runs: sorted.slice(0, runsPerCustomer),
      };
    })
    .sort((a, b) => b.failedRuns - a.failedRuns || b.lastFailedAt.getTime() - a.lastFailedAt.getTime());
};

export type ErrorGroup = {
  key: string;
  nodeType: string | null;
  message: string;
  failedRuns: number;
  customers: number;
  lastFailedAt: Date;
  // One full message to read, the newest
  example: FailedRun;
  customerList: FailedRun["user"][];
};

/** The same node type and error across customers, the most common first. */
export const groupByError = (runs: FailedRun[]): ErrorGroup[] => {
  const groups = new Map<string, { nodeType: string | null; message: string; runs: FailedRun[] }>();
  for (const run of runs) {
    const message = normalizeErrorMessage(run.error);
    const key = `${run.nodeType ?? "-"}|${message}`;
    const entry = groups.get(key) ?? { nodeType: run.nodeType, message, runs: [] };
    entry.runs.push(run);
    groups.set(key, entry);
  }

  return [...groups.entries()]
    .map(([key, group]) => {
      const sorted = [...group.runs].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
      const customerList = [...new Map(sorted.map((run) => [run.user.id, run.user])).values()];
      return {
        key,
        nodeType: group.nodeType,
        message: group.message,
        failedRuns: group.runs.length,
        customers: customerList.length,
        lastFailedAt: sorted[0].startedAt,
        example: sorted[0],
        customerList,
      };
    })
    .sort((a, b) => b.failedRuns - a.failedRuns || b.customers - a.customers);
};
