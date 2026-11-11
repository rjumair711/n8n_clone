import { SELF_HOSTED } from "./self-hosted";

// The RXJ Sentry project; public by design (browsers send to it)
const RXJ_SENTRY_DSN =
  "https://b9e51a0f783724171c76397b7177ede0@o4509519524200448.ingest.us.sentry.io/4510924234948608";

/**
 * Where errors, traces and session replays go. NEXT_PUBLIC_SENTRY_DSN picks
 * a Sentry project of your own. Without it the hosted app reports to the
 * RXJ project, and a self-hosted server reports nowhere: its errors, users
 * and AI prompts are its owner's, not RXJ's.
 */
export const getSentryDsn = (
  dsn: string | undefined,
  selfHosted: boolean
): string | undefined => dsn?.trim() || (selfHosted ? undefined : RXJ_SENTRY_DSN);

// Written out in full: Next.js only replaces the literal process.env name
export const SENTRY_DSN = getSentryDsn(process.env.NEXT_PUBLIC_SENTRY_DSN, SELF_HOSTED);
