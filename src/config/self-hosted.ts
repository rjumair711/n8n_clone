// The self-hosted edition: RXJ running on someone's own server (see
// docs/SELF_HOSTING.md). It has no billing: Polar is off, every plan limit
// and plan-locked feature is open, and nothing reports to the RXJ Sentry
// project.
//
// Decided when the app is built: Next.js writes NEXT_PUBLIC_ values into
// the server and the browser code, so both always agree. The Docker image
// is built with NEXT_PUBLIC_SELF_HOSTED=true; the Vercel app never sets it.
// Written out in full on purpose: Next.js only replaces the literal
// `process.env.NEXT_PUBLIC_SELF_HOSTED`.
export const SELF_HOSTED = process.env.NEXT_PUBLIC_SELF_HOSTED === "true";

/** The same question for a given environment (startup checks, tests). */
export const isSelfHostedEnv = (env: Record<string, string | undefined>) =>
  env.NEXT_PUBLIC_SELF_HOSTED === "true";
