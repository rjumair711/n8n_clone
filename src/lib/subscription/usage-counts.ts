import "server-only";

import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";

// What a plan's limits are counted against. Server only: usage.ts next to
// this file is also used by client components.

/** The first day of this month, UTC: what "this month" means for limits. */
export const monthStartUtc = (now = new Date()) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

/**
 * The workflows of a workspace's owner: the same rows the Workflows list
 * shows and every "create a workflow" path checks the plan's limit against.
 */
export const countWorkflows = (ownerId: string) =>
  prisma.workflow.count({ where: { userId: ownerId } });

// The execution_usage table comes with a migration. Until it is applied
// (local development and previews share the database, and only a
// production deployment migrates it) the old rule is used: the
// executions of this month that still exist.
const isMissingUsageTable = (error: unknown) => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2021") return true;

  return (
    error.code === "P2010" &&
    /42P01|does not exist/.test(JSON.stringify(error.meta ?? {})) &&
    /execution_usage/.test(JSON.stringify(error.meta ?? {}) + error.message)
  );
};

const countExecutionRows = (ownerId: string, since: Date, exceptId?: string) =>
  prisma.execution.count({
    where: {
      workflow: { userId: ownerId },
      startedAt: { gte: since },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
  });

/**
 * The executions of this month (UTC) of a workspace's owner. The count only
 * goes up: deleting executions or workflows does not give any back. Before
 * the first run of a month there is no row yet, and the executions that
 * exist for the month are what was used.
 */
export const getExecutionsThisMonth = async (ownerId: string) => {
  const month = monthStartUtc();

  // Both at once: one round trip whichever answers
  const [row, existing] = await Promise.all([
    prisma.executionUsage
      .findUnique({
        where: { userId_month: { userId: ownerId, month } },
        select: { count: true },
      })
      .catch((error: unknown) => {
        if (isMissingUsageTable(error)) return null;
        throw error;
      }),
    countExecutionRows(ownerId, month),
  ]);

  return row?.count ?? existing;
};

const incrementBelowLimit = async (ownerId: string, month: Date, limit: number) => {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    UPDATE "execution_usage"
    SET "count" = "count" + 1, "updatedAt" = now()
    WHERE "userId" = ${ownerId} AND "month" = ${month}::date AND "count" < ${limit}
    RETURNING "count"`;

  return rows[0]?.count ?? null;
};

/**
 * Counts one run of a workspace's owner against the plan's monthly limit:
 * `allowed` when it fits, and then it is counted. A run that does not fit
 * is not counted. One statement decides it, so two runs at the same moment
 * cannot both take the last execution.
 *
 * Called once per run, by the engine (see inngest/functions.ts): every run
 * goes through there, whatever started it.
 */
export const claimExecution = async ({
  ownerId,
  executionId,
  limit,
}: {
  ownerId: string;
  executionId: string;
  limit: number;
}): Promise<{ allowed: boolean; used: number }> => {
  const month = monthStartUtc();

  try {
    const counted = await incrementBelowLimit(ownerId, month, limit);
    if (counted !== null) return { allowed: true, used: counted };

    const existing = await prisma.executionUsage.findUnique({
      where: { userId_month: { userId: ownerId, month } },
      select: { count: true },
    });
    if (existing) return { allowed: false, used: existing.count };

    // The month's first counted run. It starts from the month's executions
    // that exist already, so the switch to this counter gives none back.
    const before = await countExecutionRows(ownerId, month, executionId);
    const allowed = before < limit;

    const inserted = await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "execution_usage" ("userId", "month", "count", "updatedAt")
      VALUES (${ownerId}, ${month}::date, ${allowed ? before + 1 : before}, now())
      ON CONFLICT ("userId", "month") DO NOTHING
      RETURNING "count"`;

    if (inserted.length > 0) return { allowed, used: inserted[0].count };

    // Another run made the row in the meantime
    const retried = await incrementBelowLimit(ownerId, month, limit);

    return retried !== null
      ? { allowed: true, used: retried }
      : { allowed: false, used: limit };
  } catch (error) {
    if (!isMissingUsageTable(error)) throw error;

    // Before the migration: this run's own row is already counted
    const used = await countExecutionRows(ownerId, month);

    return { allowed: used <= limit, used };
  }
};

/** The plan of a workspace and what it has used: the Usage card's numbers. */
export const getUsage = async (ownerId: string) => {
  const [user, workflowCount, executionsUsed] = await Promise.all([
    prisma.user.findUnique({
      where: { id: ownerId },
      select: { plan: true, trialEndsAt: true },
    }),
    countWorkflows(ownerId),
    getExecutionsThisMonth(ownerId),
  ]);

  return user && { plan: user.plan, trialEndsAt: user.trialEndsAt, workflowCount, executionsUsed };
};
