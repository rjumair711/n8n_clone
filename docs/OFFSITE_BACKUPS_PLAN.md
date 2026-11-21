# Off-site backups of managed servers (R2): paused plan

Status on 2026-11-21: **paused** for more important work. Half of it is
built, on the local branch `task/r2-offsite-backups` (commit `b57a908`,
not pushed: it does not type-check until the migration exists).

## Why

A managed server keeps its nightly backups on its own disk
(`/opt/rxj/self-host/backups`). If the server dies, they die with it. The
backups need a copy somewhere else.

## Decisions already made

1. **Storage:** the platform's own Cloudflare R2 bucket, one folder per
   server: `servers/<serverId>/rxj-<date>.sql.gz.enc`. One object a day; a
   second one the same day replaces it.
2. **No R2 keys on customer servers.** Each night the agent asks the app
   (with its install token) for a presigned upload URL, good for about 15
   minutes and for one PUT of exactly the size it named (the size is
   signed in). It uploads straight to R2, so big files never go through
   Vercel, and one customer cannot read or delete another's backups.
3. **Encryption: a per-server key, RXJ keeps a copy.** The server makes its
   own key (`openssl rand -hex 32`) and encrypts each dump with it (AES-256,
   openssl) before it leaves. RXJ stores the key encrypted with
   `ENCRYPTION_KEY`, like a credential. A leaked bucket exposes nothing,
   and RXJ can still restore when a server dies. A reinstalled server gets
   the same key back from RXJ, so it can read its older backups.
4. **Checked, not trusted:** after the upload the app asks R2 itself (HEAD)
   that the object is there, and records its time and size.
5. **Retention:** an R2 lifecycle rule deletes objects after 30 days. No
   code.
6. **Migration:** create it only once `prisma migrate status` is clean,
   i.e. after production has applied `20261121161259_managed_servers`
   (rule 10 in CLAUDE.md).

## Done (on the branch)

* `presignS3Url` in `src/lib/aws-sigv4.ts`, checked against the AWS
  test vector for presigned URLs
* `src/lib/offsite-backup.ts`: R2 settings, object names, size cap (2 GB),
  presigned upload, HEAD, download and listing, listing parser
* `POST /api/managed-servers/backup-key`: the server proposes its key; the
  first one is kept and returned from then on
* `POST /api/managed-servers/backups`: `start` (presigned URL) and
  `complete` (check in R2, record it)
* `authenticateManagedServer` in `src/lib/managed-servers.ts`, shared by
  every server route (the heartbeat uses it too)
* New columns in `schema.prisma` (no migration yet): `backupKeyEncrypted`,
  `lastOffsiteBackupAt`, `lastOffsiteBackupKey`, `lastOffsiteBackupBytes`
* `scripts/rotate-encryption-key.ts` re-encrypts the backup keys too

## Left to do

1. Merge `main` into the branch (it changed since), check
   `prisma migrate status` and the drift check, create the migration with
   `--create-only`, show the SQL, wait for an OK, run `prisma generate`.
2. `self-host/rxj-agent.sh`: get or register the backup key, encrypt the
   dump, `start` → PUT → `complete` in `backup`; a `restore <url>` command
   that downloads, decrypts and loads a backup into a fresh install.
3. Pages: "last off-site backup" on Settings → Private server and on the
   fleet page (a problem when older than 48 hours); an admin-only list of
   a server's backups with a download link (needs two-factor, written to
   the audit log).
4. Tests: move the heartbeat's source checks in `testCoreNodes.ts` to
   `src/lib/managed-servers.ts`; tests for object names, the listing
   parser, the routes' rules and the agent (`bash -n`, stubbed run).
5. Docs: README (env vars, how it works), `docs/SELF_HOSTING.md`
   (restoring), `docs/TESTING.md` (manual steps).

## To set up in Cloudflare (owner)

1. An R2 bucket, e.g. `rxj-server-backups`, public access off.
2. An R2 API token with **Object Read & Write** on that bucket only.
3. A lifecycle rule on the bucket: delete objects after 30 days.
4. In Vercel: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`, `R2_BACKUP_BUCKET`. A separate bucket for
   development keeps test uploads apart. Without these, servers keep
   local backups only and nothing fails.
