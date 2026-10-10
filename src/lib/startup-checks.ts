// Settings without which the server must not start. Pure, so it can be
// tested; src/instrumentation.ts runs it when the server starts.

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
