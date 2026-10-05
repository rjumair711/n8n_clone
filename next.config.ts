import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

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
