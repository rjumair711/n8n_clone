import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import {
  getSecurityHeaderRules,
  getSentryCspReportUri,
} from "./src/config/security-headers";

// The DSN the Sentry configs use; public by design. Violations of the
// report-only Content-Security-Policy are sent to the same Sentry project,
// unless CSP_REPORT_URI names another endpoint.
const SENTRY_DSN =
  "https://b9e51a0f783724171c76397b7177ede0@o4509519524200448.ingest.us.sentry.io/4510924234948608";

const nextConfig: NextConfig = {

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
      reportUri: process.env.CSP_REPORT_URI || getSentryCspReportUri(SENTRY_DSN),
    });
  },

  // The Code node sandbox loads a .wasm file at runtime; keep it out of the bundle
  // ssh2 loads optional native add-ons at runtime
  serverExternalPackages: ["quickjs-emscripten", "ssh2"],
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
