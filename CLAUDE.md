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
8. Don't push, and don't merge PRs. I do that.

## Facts that affect these rules

Observed in this repository; check them again if they matter to a task.

- `prisma migrate dev --create-only` does not only create a file. If an
  older migration is still pending, it applies that one to the database
  first (this happened on 2026-10-10). So rule 5 comes before rule 2: run
  `prisma migrate status` first, and if anything is pending, stop and ask
  instead of running `migrate dev`.
- `prisma migrate dev` (with or without `--create-only`) builds a temporary
  shadow database on the same Neon server to replay the migrations, and
  removes it afterwards. It does not touch the real database's tables.
- The build does not apply migrations. The `build` script in `package.json`
  is `prisma generate && cross-env NODE_OPTIONS=--max-old-space-size=8192
  next build`, and `postinstall` is `prisma generate`. There is no
  `vercel.json`. A deploy therefore runs new code against whatever schema
  the database has at that moment: a migration has to be applied by hand,
  and before the code that needs it goes live.
- The migration history starts at `20261010000000_baseline`, which replaced
  the 38 migrations that existed before it.
