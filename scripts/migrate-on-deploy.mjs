// Part of `npm run build`: applies pending database migrations when, and
// only when, the build is a Vercel production deployment.
//
// Preview deployments and local builds use the same database as production,
// so they must never migrate it: a preview is built from a branch that has
// not been reviewed and merged yet. Migrations reach production by merging
// to main (see CLAUDE.md).
//
// Plain Node with no dependencies beyond Prisma itself, so it runs the same
// on Vercel's Linux builders and on Windows.

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

/**
 * Whether this build may migrate the database. VERCEL_ENV is set by Vercel
 * to "production", "preview" or "development"; anywhere else it is unset.
 */
export const shouldMigrate = (env = process.env) => env.VERCEL_ENV === "production";

// `prisma migrate deploy`, run with this Node and the installed Prisma CLI
const runMigrateDeploy = () => {
  const prismaCli = createRequire(import.meta.url).resolve("prisma/build/index.js");

  const result = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    stdio: "inherit",
  });

  if (result.error) throw result.error;

  // null when the process was killed by a signal: that is a failure too
  return result.status ?? 1;
};

/**
 * Returns the exit code for the build step: 0 to go on, anything else stops
 * the build, so new code is never deployed onto a database it was not
 * migrated for.
 */
export const migrateOnDeploy = ({
  env = process.env,
  migrate = runMigrateDeploy,
  log = console.log,
} = {}) => {
  if (!shouldMigrate(env)) {
    log(
      `[migrate-on-deploy] Not a Vercel production build (VERCEL_ENV=${env.VERCEL_ENV ?? "not set"}): the database is left as it is.`
    );
    return 0;
  }

  log("[migrate-on-deploy] Vercel production build: running prisma migrate deploy.");

  let status;
  try {
    status = migrate();
  } catch (error) {
    log(`[migrate-on-deploy] prisma migrate deploy could not be run: ${error?.message ?? error}`);
    return 1;
  }

  if (status !== 0) {
    log(
      `[migrate-on-deploy] prisma migrate deploy failed (exit code ${status}). The build is stopped; the live app keeps running the previous deployment.`
    );
    return status || 1;
  }

  log("[migrate-on-deploy] The database is up to date.");
  return 0;
};

// Only when run as a script, not when imported by the tests
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(migrateOnDeploy());
}
