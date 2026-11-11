// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { SENTRY_DSN } from "./config/sentry-dsn";
import { redactForSentry } from "./lib/redaction";

Sentry.init({
  // Not set on a self-hosted server: Sentry is then off (src/config/sentry-dsn.ts)
  dsn: SENTRY_DSN,
  enabled: Boolean(SENTRY_DSN),

  // Add optional integrations for additional features
  integrations: [Sentry.replayIntegration()],

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,

  // Secrets are taken out of everything before it leaves the app: errors,
  // traces (which include AI prompts and answers) and logs
  beforeSend: (event) => redactForSentry(event),
  beforeSendTransaction: (event) => redactForSentry(event),
  beforeSendLog: (log) => redactForSentry(log),
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
