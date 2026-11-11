import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import {
  getSecurityHeaderRules,
  getSentryCspReportUri,
} from "./src/config/security-headers";

import { SELF_HOSTED } from "./src/config/self-hosted";
import { SENTRY_DSN } from "./src/config/sentry-dsn";

// SENTRY_DSN is what the Sentry configs use (none on a self-hosted server,
// see src/config/sentry-dsn.ts). Violations of the report-only
// Content-Security-Policy are sent to the same Sentry project, unless
// CSP_REPORT_URI names another endpoint.

const nextConfig: NextConfig = {
  // The self-hosted Docker image runs the small standalone server
  // (Dockerfile). The Vercel build is left as it was.
  ...(SELF_HOSTED ? { output: "standalone" as const } : {}),

  // A self-hosted server has no marketing site and no billing: the address
  // opens the app (signed-out visitors are sent on to /login)
  async redirects() {
    if (!SELF_HOSTED) return [];

    return ["/", "/pricing", "/billing"].map((source) => ({
      source,
      destination: "/workflows",
      permanent: false,
    }));
  },

  typescript: {
    // Bypasses the worker process that crashes on cleanup
    ignoreBuildErrors: true,
  },
  eslint: {
    // Bypasses the worker process that crashes on cleanup
    ignoreDuringBuilds: true,
  },

  devIndicators: false,

  // HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy and a
  // report-only Content-Security-Policy. See src/config/security-headers.ts,
  // also for where to make an exception for an embeddable route.
  async headers() {
    return getSecurityHeaderRules({
      reportUri: process.env.CSP_REPORT_URI || getSentryCspReportUri(SENTRY_DSN ?? null),
    });
  },

  // The Code node sandbox loads a .wasm file at runtime; keep it out of the bundle
  // ssh2 loads optional native add-ons at runtime
  // sharp (images for the vision nodes) and pg (Postgres node, optional
  // pg-native) are native too; Next lists both by default, named here so
  // the list is complete. They must never reach the browser bundle: the
  // files that load them are marked "server-only".
  serverExternalPackages: ["quickjs-emscripten", "ssh2", "sharp", "pg"],
  outputFileTracingIncludes: {
    "/api/inngest": [
      "./node_modules/@jitl/quickjs-*/**/*",
      // The PDF Generator reads its fonts from disk at runtime
      "./assets/fonts/*.ttf",
    ],
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "rjm-jj",

  project: "RXJ",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
