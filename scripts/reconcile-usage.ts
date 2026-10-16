// Recomputes every account's usage from the real rows.
//
//   npx tsx scripts/reconcile-usage.ts --dry-run   (changes nothing)
//   npx tsx scripts/reconcile-usage.ts
//
// - user.workflowCount: set to the number of workflows the account owns.
//   The app no longer reads it (workflows are counted, see
//   src/lib/subscription/usage-counts.ts); this keeps the column truthful
//   for anything that still does.
// - This month's executions (execution_usage): raised to the executions of
//   the month that exist, when they are more. Never lowered: the count only
//   goes up, so deleting runs cannot give any back. Needs the
//   20261016190433_usage_counts_and_indexes migration; without it this part
//   is skipped.
//
// It prints every change. Running it twice changes nothing the second time.

import { Prisma, PrismaClient } from "@prisma/client";

const main = async () => {
  // Outside Next.js nothing reads .env for us. Variables that are already
  // set (as on a server) win; no .env file is fine too.
  try {
    process.loadEnvFile(".env");
  } catch {
    // No .env file: the environment has to provide the variables
  }

  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) console.log("Dry run: nothing will be changed.\n");

  const prisma = new PrismaClient();

  try {
    // ---- Workflows ----
    const workflows = await prisma.$queryRaw<{ id: string; stored: number; real: number }[]>`
      SELECT u.id, u."workflowCount" AS stored,
             (SELECT count(*) FROM "Workflow" w WHERE w."userId" = u.id)::int AS real
      FROM "user" u
      WHERE u."workflowCount" <> (SELECT count(*) FROM "Workflow" w WHERE w."userId" = u.id)
      ORDER BY u.id`;

    console.log(`Workflows: ${workflows.length} account(s) to correct`);
    for (const row of workflows) {
      console.log(`  ${row.id}: workflowCount ${row.stored} -> ${row.real}`);

      if (!dryRun) {
        // Only when it still has the value that was read
        await prisma.user.updateMany({
          where: { id: row.id, workflowCount: row.stored },
          data: { workflowCount: row.real },
        });
      }
    }

    // ---- Executions this month ----
    const month = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));

    let executions: { id: string; counted: number | null; real: number }[];
    try {
      executions = await prisma.$queryRaw<{ id: string; counted: number | null; real: number }[]>`
        SELECT w."userId" AS id, eu."count" AS counted, count(*)::int AS real
        FROM "Execution" e
        JOIN "Workflow" w ON w.id = e."workflowId"
        LEFT JOIN "execution_usage" eu ON eu."userId" = w."userId" AND eu."month" = ${month}::date
        WHERE e."startedAt" >= ${month}
        GROUP BY w."userId", eu."count"
        HAVING eu."count" IS NULL OR eu."count" < count(*)
        ORDER BY w."userId"`;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        /execution_usage/.test(JSON.stringify(error.meta ?? {}) + error.message)
      ) {
        console.log("\nExecutions: skipped, the execution_usage table does not exist yet (migration not applied).");
        return;
      }
      throw error;
    }

    console.log(`\nExecutions (${month.toISOString().slice(0, 7)}): ${executions.length} account(s) to raise`);
    for (const row of executions) {
      console.log(`  ${row.id}: ${row.counted ?? "no row"} -> ${row.real}`);

      if (!dryRun) {
        // GREATEST: a run counted in the meantime is kept
        await prisma.$executeRaw`
          INSERT INTO "execution_usage" ("userId", "month", "count", "updatedAt")
          VALUES (${row.id}, ${month}::date, ${row.real}, now())
          ON CONFLICT ("userId", "month")
          DO UPDATE SET "count" = GREATEST("execution_usage"."count", EXCLUDED."count"), "updatedAt" = now()`;
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(dryRun ? "\nDry run finished." : "\nDone.");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
