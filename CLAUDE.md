# RXJ: rules for Claude

The local `.env` and the live Vercel app share ONE Neon database. Every
change must be safe for production.

## Database rules (shared with production)

1. Never run: `prisma db push`, `prisma migrate reset`, `--accept-data-loss`,
   or any DROP / TRUNCATE / DELETE without a WHERE clause.
2. Schema changes: create the migration with
   `prisma migrate dev --create-only`, show me the SQL, and wait for my OK.
   Apply only with `prisma migrate deploy`.
3. Migrations must be additive and backward compatible, because the live
   app runs the old code until Vercel redeploys. New columns must be
   nullable or have a default. No renames or drops in the same task; if
   something must be removed, do it in a later task after the code
   stops using it. 
4. Data changes (UPDATE / INSERT / backfills) go inside the migration,
   must be idempotent (safe to run twice), and must be shown to me first.
5. Before and after any migration, run `prisma migrate status` and a
   drift check (`prisma migrate diff --from-schema-datasource
   prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma
   --script`). If anything is unexpected, stop and tell me.
6. Never edit or delete an already-applied migration.
7. Tests and scripts that write data must use a dedicated test account,
   and must clean up after themselves. Never modify or delete real
   users' data.
8. You may push task branches after the build and tests pass. Never push
   to `main`, never force-push, and never merge PRs. I do that.
9. Migrations reach production only by merging to `main`: the Vercel
   production build runs `prisma migrate deploy` (see below). A PR that
   adds a migration changes the production database when it is merged, so
   it must be reviewed with that in mind: say so in the task summary and
   show the SQL. Claude does not run `prisma migrate deploy` itself unless
   told to for that migration.
10. Before `prisma migrate dev --create-only`, run `prisma migrate status`.
    If anything is pending, stop and ask: `migrate dev` would apply it.

## Facts that affect these rules

Observed in this repository; check them again if they matter to a task.

- `prisma migrate dev --create-only` does not only create a file. If an
  older migration is still pending, it applies that one to the database
  first (this happened on 2026-10-10). That is the reason for rule 10. A
  migration from an earlier task that is not merged yet counts as pending.
- `prisma migrate dev` (with or without `--create-only`) builds a temporary
  shadow database on the same Neon server to replay the migrations, and
  removes it afterwards. It does not touch the real database's tables.
- The `build` script in `package.json` is `prisma generate && node
  scripts/migrate-on-deploy.mjs && cross-env
  NODE_OPTIONS=--max-old-space-size=8192 next build`, and `postinstall` is
  `prisma generate`. There is no `vercel.json`.
- `scripts/migrate-on-deploy.mjs` runs `prisma migrate deploy` only when
  `VERCEL_ENV=production`. Preview deployments and local builds share the
  database and never migrate it. If the migration fails, the build fails
  and Vercel keeps serving the previous deployment.
- The database is migrated before `next build`, so for a few minutes (or
  for good, if the build then fails) the old code runs on the new schema.
  That is why rule 3 matters.
- The migration history starts at `20261010000000_baseline`, which replaced
  the 38 migrations that existed before it.
