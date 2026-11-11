# syntax=docker/dockerfile:1
#
# The self-hosted edition of RXJ, for running on your own server.
# How to use it: docs/SELF_HOSTING.md. The Vercel app does not use this file.
#
# Built with NEXT_PUBLIC_SELF_HOSTED=true: no billing, every plan feature
# unlocked, no reports to the RXJ Sentry project (src/config/self-hosted.ts).
# NEXT_PUBLIC_APP_URL is left out on purpose, so one image works on every
# domain: the browser uses the address it is open at, the server reads
# NEXT_PUBLIC_APP_URL when it starts.

FROM node:22-bookworm-slim AS base
# Prisma's engines need OpenSSL; ca-certificates for outgoing HTTPS
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---------------------------------------------------------------- deps
FROM base AS deps
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# `npm ci` runs `prisma generate`, which reads DATABASE_URL without connecting
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm ci --no-audit --no-fund

# ---------------------------------------------------------------- build
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_PUBLIC_SELF_HOSTED=true \
    NEXT_TELEMETRY_DISABLED=1
# Optional: your own Sentry project. Written into the image when it is
# built, so it has to be given here (docker build --build-arg ...).
ARG NEXT_PUBLIC_SENTRY_DSN=""
ENV NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN}
# Memory for `next build`, in MB. The build needs several GB.
ARG NODE_HEAP_MB=6144

# `next build` directly, not `npm run build`: that script's migration step
# is for the Vercel app. The values below are placeholders the build reads
# without connecting anywhere; they are not kept in the image.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
    BETTER_AUTH_SECRET=build-placeholder \
    BETTER_AUTH_URL=http://localhost:3000 \
    ENCRYPTION_KEY=build-placeholder \
    NODE_OPTIONS=--max-old-space-size=${NODE_HEAP_MB} \
    sh -c "npx prisma generate && npx next build"

# The Prisma CLI on its own, to apply migrations when the container starts.
# The standalone server does not include it. Same versions as the app.
RUN mkdir /opt/migrate \
 && cd /opt/migrate \
 && npm init -y > /dev/null \
 && npm install --no-audit --no-fund \
      "prisma@$(node -p "require('/app/node_modules/prisma/package.json').version")" \
      "dotenv@$(node -p "require('/app/node_modules/dotenv/package.json').version")" \
 && cp -r /app/prisma /app/prisma.config.ts .

# ---------------------------------------------------------------- run
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_PUBLIC_SELF_HOSTED=true \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /opt/migrate /opt/migrate

USER node
EXPOSE 3000

# Apply pending migrations to this server's own database, then start.
# A failed migration stops the container instead of starting new code on an
# old schema. RUN_MIGRATIONS=false skips the step.
CMD ["sh", "-c", "set -e; if [ \"${RUN_MIGRATIONS:-true}\" = \"true\" ]; then (cd /opt/migrate && node node_modules/prisma/build/index.js migrate deploy); fi; exec node server.js"]
