import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");

    const { getAdminVerificationWarning } = await import("./lib/admin");
    const warning = getAdminVerificationWarning();
    if (warning) console.warn(warning);

    const { getPrivateNetworkWarnings } = await import("./lib/private-network-allowlist");
    for (const networkWarning of getPrivateNetworkWarnings()) console.warn(networkWarning);

    const { getTurnstileWarning } = await import("./lib/turnstile");
    const turnstileWarning = getTurnstileWarning();
    if (turnstileWarning) console.warn(turnstileWarning);
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
