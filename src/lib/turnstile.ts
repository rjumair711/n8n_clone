// Cloudflare Turnstile on the sign-up form. On only when both keys are set:
// the site key draws the widget, the secret key checks its answer.

type TurnstileEnv = Record<string, string | undefined>;

export const getTurnstileConfig = (env: TurnstileEnv = process.env) => {
  const siteKey = env.TURNSTILE_SITE_KEY?.trim();
  const secretKey = env.TURNSTILE_SECRET_KEY?.trim();

  return siteKey && secretKey ? { siteKey, secretKey } : null;
};

/**
 * The warning to log at startup when only one of the two keys is set, or
 * null. With one key the check stays off: the form could not pass it.
 */
export const getTurnstileWarning = (env: TurnstileEnv = process.env) => {
  const hasSiteKey = !!env.TURNSTILE_SITE_KEY?.trim();
  const hasSecretKey = !!env.TURNSTILE_SECRET_KEY?.trim();

  if (hasSiteKey === hasSecretKey) return null;

  return `[RXJ] Only ${hasSiteKey ? "TURNSTILE_SITE_KEY" : "TURNSTILE_SECRET_KEY"} is set. Turnstile needs both keys, so sign-up is not protected by it.`;
};

// The header Better Auth's captcha plugin reads the widget's answer from
export const TURNSTILE_HEADER = "x-captcha-response";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Asks Cloudflare whether a widget's answer is genuine. Used by hosted
 * forms; sign-up is checked by Better Auth's captcha plugin. An answer
 * works once. Anything but a clear yes is a no.
 */
export const verifyTurnstileToken = async (
  token: string | null | undefined,
  secretKey: string,
  remoteIp?: string | null
): Promise<boolean> => {
  if (!token || token.length > 4096) return false;

  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      body: new URLSearchParams({
        secret: secretKey,
        response: token,
        ...(remoteIp ? { remoteip: remoteIp } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const result = (await response.json()) as { success?: unknown };

    return result.success === true;
  } catch {
    return false;
  }
};
