// Settings without which the server must not start. Pure, so it can be
// tested; src/instrumentation.ts runs it when the server starts.

import { isSelfHostedEnv } from "@/config/self-hosted";

type Env = Record<string, string | undefined>;

/**
 * What is wrong with the environment, or nothing.
 *
 * In production the Inngest signing key is required: it is how the
 * /api/inngest endpoint knows a request to run a workflow step comes from
 * Inngest. Without it the endpoint either cannot be used or, in Inngest's
 * dev mode, runs steps for anyone who calls it.
 */
export const getStartupErrors = (env: Env = process.env): string[] => {
  const errors: string[] = [];

  if (env.NODE_ENV === "production" && !env.INNGEST_SIGNING_KEY?.trim()) {
    errors.push(
      "INNGEST_SIGNING_KEY is not set. In production it is required, so that only Inngest can call /api/inngest. Copy the signing key of the app's environment from the Inngest dashboard (or of your self-hosted Inngest server) into INNGEST_SIGNING_KEY."
    );
  }

  if (isSelfHostedEnv(env)) errors.push(...getSelfHostedErrors(env));

  return errors;
};

/**
 * The self-hosted edition (docs/SELF_HOSTING.md) unlocks every plan and
 * switches billing off. It must never run as the hosted app: on Vercel it
 * would share the hosted database and give every account Pro. It also needs
 * the secrets that the hosted app has set in Vercel.
 */
export const getSelfHostedErrors = (env: Env): string[] => {
  const errors: string[] = [];

  if (env.VERCEL) {
    errors.push(
      "NEXT_PUBLIC_SELF_HOSTED=true is set on Vercel. The self-hosted edition is for your own server only; remove the variable from the Vercel project."
    );
  }

  for (const name of ["DATABASE_URL", "BETTER_AUTH_SECRET", "ENCRYPTION_KEY"]) {
    if (!env[name]?.trim()) {
      errors.push(`${name} is not set. Generate it as described in docs/SELF_HOSTING.md and put it in the .env file next to docker-compose.yml.`);
    }
  }

  return errors;
};

/**
 * Stops the server from starting when something required is missing. Not
 * during `next build`, which also runs with NODE_ENV=production but serves
 * nothing.
 */
export const assertStartupEnvironment = (env: Env = process.env) => {
  if (env.NEXT_PHASE === "phase-production-build") return;

  const errors = getStartupErrors(env);
  if (errors.length === 0) return;

  throw new Error(`[RXJ] The server cannot start:\n- ${errors.join("\n- ")}`);
};
