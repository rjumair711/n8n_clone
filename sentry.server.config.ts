// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { SENTRY_DSN } from "./src/config/sentry-dsn";
import { redactForSentry } from "./src/lib/redaction";

Sentry.init({
  // Not set on a self-hosted server: Sentry is then off (src/config/sentry-dsn.ts)
  dsn: SENTRY_DSN,
  enabled: Boolean(SENTRY_DSN),


  integrations: [
    // Add the Vercel AI SDK integration to sentry.server.config.ts
    Sentry.vercelAIIntegration({
      recordInputs: true,
      recordOutputs: true
    }),
    Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
  ],
  
  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,

  // Secrets are taken out of everything before it leaves the app: errors,
  // traces (which include AI prompts and answers) and logs
  beforeSend: (event) => redactForSentry(event),
  beforeSendTransaction: (event) => redactForSentry(event),
  beforeSendLog: (log) => redactForSentry(log),
});
