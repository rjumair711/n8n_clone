# Self-hosting RXJ

Run RXJ on your own server (a VPS from Hetzner, DigitalOcean, Contabo or
similar) instead of using the hosted app. It is free: there are no plans and
no billing, and every feature is unlocked for every account on your server.
Your workflows, credentials and data stay in your own database.

## Managed private server: $20 a month

Want your own server but not the technical work? RXJ can set it up and run
it for you. You keep the server in your own name (from Hetzner or similar,
about $5–7 a month, paid to them), and for **$20 a month** RXJ takes care of:

* installing RXJ on it, with your domain and HTTPS
* monthly updates
* daily backups
* fixing it when something breaks
* building and looking after **up to 5 of your workflows**

The server itself has no limits: you can build as many workflows on it as
you like. Having RXJ build or look after more than 5 is priced separately.

## License

RXJ is source-available under the [Elastic License 2.0](../LICENSE). You may
use it for free, in a business and on your own server, and change it. You
may not offer it to other people as a hosted or managed service; only RXJ
does that.

## What you get

The `self-host/` folder starts six containers with Docker Compose:

| Container | What it does |
| --------- | ------------ |
| `app` | RXJ itself (the image `ghcr.io/rjumair711/rxj`) |
| `postgres` | The database, Postgres 17 with pgvector |
| `redis` | Inngest's queue (Valkey, a Redis-compatible open-source server) |
| `inngest` | Runs the workflows: triggers, schedules, waits and retries |
| `browser` | Headless Chrome for the Browser node; only the app can reach it |
| `caddy` | HTTPS for your domain, with a free Let's Encrypt certificate |

Only Caddy is open to the internet, on ports 80 and 443.

**How it differs from the hosted app:**

* No plans or limits: every node (SSH, WhatsApp, Gmail, AI Agent, the
  Schedule Trigger), every enterprise feature, and no execution, workflow,
  credential or daily message limits. Pricing and Billing are gone; the
  domain opens the app.
* Nothing is sent to RXJ. Error reports (Sentry) are off unless you
  build the image with your own Sentry DSN.
* "RXJ AI (included)" uses the provider keys that *you* add as an admin
  under Settings. Each account still has the Pro plan's monthly credit
  allowance, so one account cannot run up your AI bill without limit.
* The editor learns a run's progress by asking the server every moment
  instead of through Inngest Cloud's live stream. The result is the same.

## Requirements

* A Linux server with at least **2 GB of RAM** (4 GB is comfortable) and
  20 GB of disk, x86-64 (amd64). Ubuntu 24.04 is a good default.
* A domain or subdomain you can point at the server, e.g. `rxj.example.com`.
* Docker with the Compose plugin:

  ```bash
  curl -fsSL https://get.docker.com | sh
  ```

## Install

1. **Point your domain at the server.** Add a DNS `A` record for
   `rxj.example.com` with the server's IP address. Wait until
   `ping rxj.example.com` shows that address.

2. **Get the files** (the code is public):

   ```bash
   git clone https://github.com/rjumair711/n8n_clone.git rxj
   cd rxj/self-host
   cp env.example .env
   ```

3. **Fill in `.env`.** Set `RXJ_DOMAIN` and `ADMIN_EMAILS`, then generate the
   five secrets, one at a time:

   ```bash
   openssl rand -hex 32
   ```

   Put one result each into `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`,
   `ENCRYPTION_KEY`, `INNGEST_SIGNING_KEY` and `INNGEST_EVENT_KEY`. **Keep a
   copy of `ENCRYPTION_KEY` somewhere safe**: without it, saved credentials
   cannot be read again.

4. **Start it:**

   ```bash
   docker compose up -d
   ```

   The first start downloads the images and applies the database migrations.
   Watch it with `docker compose logs -f app` until you see `Ready`.

5. **Open `https://rxj.example.com`** and sign up. The first certificate
   can take a minute. Sign up with an address in `ADMIN_EMAILS` to manage
   templates and the included AI models.

Without `RESEND_API_KEY` there is no email: sign-up works without email
verification, and "forgot password" cannot send a link.

## Update

```bash
cd rxj/self-host
git pull
docker compose pull
docker compose up -d
```

The app applies new database migrations when it starts. If a migration
fails, the container stops and the logs say why (`docker compose logs app`);
fix the cause and start it again.

## Back up

Everything is in the `postgres` container. A daily dump:

```bash
docker compose exec -T postgres pg_dump -U rxj rxj | gzip > rxj-$(date +%F).sql.gz
```

Keep the dumps and your `.env` file somewhere other than the server.

To restore into a fresh install, start only Postgres, load the dump, then
start everything:

```bash
docker compose up -d postgres
gunzip -c rxj-2026-11-11.sql.gz | docker compose exec -T postgres psql -U rxj rxj
docker compose up -d
```

## Useful commands

| What | Command |
| ---- | ------- |
| Status of the containers | `docker compose ps` |
| App logs | `docker compose logs -f app` |
| Restart the app | `docker compose restart app` |
| Stop everything (data stays) | `docker compose down` |
| Inngest dashboard (runs, retries) | From your computer: `ssh -L 8288:localhost:8288 you@your-server`, then open `http://localhost:8288` |

The Inngest dashboard has no login, so it is only reachable from the server
itself; the SSH tunnel above is how you open it.

## Options

* **Google and GitHub sign-in:** create the OAuth apps, add the redirect URIs
  `https://<your domain>/api/auth/callback/google` (and `/github`), and set
  the `GOOGLE_*` and `GITHUB_*` values in `.env`. The Google credential for
  Gmail and Sheets also needs `https://<your domain>/api/oauth/google/callback`.
* **Local AI (Ollama) on the same server:** run Ollama on the host, set
  `PRIVATE_NETWORK_ALLOWLIST=host.docker.internal:11434` and use
  `http://host.docker.internal:11434` as the base URL in the Chat Model node.
* **A fixed version** instead of `latest`: `RXJ_IMAGE=ghcr.io/rjumair711/rxj:sha-<commit>`.
* **Any other variable** from the README's "Environment variables" table can
  go in `.env`.
* **Build the image yourself** instead of downloading it (needs about 8 GB of
  memory): `docker compose build app`. Add your own Sentry project with
  `docker compose build --build-arg NEXT_PUBLIC_SENTRY_DSN=<dsn> app`.

## Troubleshooting

* **The site does not load / no certificate:** the DNS record must point at
  this server and ports 80 and 443 must be open in its firewall
  (`ufw allow 80,443/tcp`). See `docker compose logs caddy`.
* **"The server cannot start":** a required value is missing in `.env`; the
  log names it.
* **Workflows never run:** check `docker compose logs inngest`, and that
  `INNGEST_SIGNING_KEY` and `INNGEST_EVENT_KEY` are set. The Inngest server
  finds the app at `http://app:3000/api/inngest` by itself.
* **Changed `POSTGRES_PASSWORD` after the first start:** Postgres keeps the
  password it was created with. Change it back, or change it inside Postgres
  too.

## For the maintainer: publishing the image

`.github/workflows/docker-image.yml` builds the image on every push to `main`
and publishes it as `ghcr.io/<owner>/rxj:latest` (and `:sha-<commit>`; a tag
`v1.2.3` publishes `:1.2.3`). After the first run, make the package public
once: GitHub → your profile → Packages → `rxj` → Package settings → Change
visibility → Public. Until then, nobody else can pull it.

The image is built with `NEXT_PUBLIC_SELF_HOSTED=true`. The Vercel app never
sets that variable, and a server that has it refuses to start on Vercel
(`src/lib/startup-checks.ts`), so the hosted app keeps its plans and billing.
