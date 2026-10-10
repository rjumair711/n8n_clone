// What the audit log records. No server imports: the settings page uses
// the labels, and the rules are pure functions so they can be tested.

export const AUDIT_ACTIONS = {
  "credential.created": "Credential created",
  "credential.updated": "Credential updated",
  "credential.deleted": "Credential deleted",
  "workflow.activated": "Workflow activated",
  "workflow.deactivated": "Workflow deactivated",
  "workflow.deleted": "Workflow deleted",
  "api_key.created": "API key created",
  "api_key.revoked": "API key revoked",
  "template.published": "Template published",
  "template.updated": "Template updated",
  "template.deleted": "Template deleted",
  "auth.sign_in": "Signed in",
  "two_factor.enabled": "Two-factor authentication turned on",
  "two_factor.disabled": "Two-factor authentication turned off",
  "two_factor.backup_codes_regenerated": "New backup codes made",
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

export const getAuditActionLabel = (action: string) =>
  (AUDIT_ACTIONS as Record<string, string>)[action] ?? action;

const MAX_TARGET_LENGTH = 200;
const MAX_NAME_LENGTH = 120;

/**
 * The target of an action as one readable line: `Credential "SMTP" (id)`.
 * Names come from users, so they are cut to a sane length and kept on one
 * line. Only the name and id of a thing ever go here, never its content.
 */
export const describeAuditTarget = (
  kind: string,
  { name, id }: { name?: string | null; id?: string | null } = {}
): string => {
  const cleanName = (name ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);

  return [kind, cleanName ? `"${cleanName}"` : "", id ? `(${id})` : ""]
    .filter(Boolean)
    .join(" ")
    .slice(0, MAX_TARGET_LENGTH);
};

/**
 * The address a request came from, as the proxy in front of the app reports
 * it: the first entry of X-Forwarded-For, or X-Real-IP.
 */
export const getRequestIp = (
  headers: { get(name: string): string | null } | null | undefined
): string | null => {
  const forwarded = headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || headers?.get("x-real-ip")?.trim() || "";

  // An address, not whatever a client chose to send in the header
  return /^[0-9a-fA-F:.]{2,45}$/.test(ip) ? ip : null;
};

type AuthSession = { user?: { id?: string; twoFactorEnabled?: boolean | null } | null } | null;

export type AuthAuditEvent = {
  userId: string;
  action: AuditAction;
  target: string | null;
};

// The sign-in providers configured in src/lib/auth.ts. The provider comes
// from the URL, so only a known one is written down as itself.
const PROVIDER_NAMES: Record<string, string> = {
  google: "Google",
  github: "GitHub",
};

const isError = (returned: unknown) => {
  const statusCode = (returned as { statusCode?: unknown } | null)?.statusCode;

  return typeof statusCode === "number" && statusCode >= 400;
};

/**
 * What a finished Better Auth request means for the audit log, or null.
 *
 *   path          the endpoint, e.g. "/sign-in/email"
 *   returned      what the endpoint answered (an error has a statusCode)
 *   newSession    the session the request started, if it started one
 *   priorSession  the session the request arrived with, if any
 *   provider      for /callback/:id, the OAuth provider
 *
 * A password sign-in for an account with two-factor on is not a sign-in
 * yet: it answers `twoFactorRedirect` and the sign-in is recorded when the
 * code is accepted.
 */
export const getAuthAuditEvent = ({
  path,
  returned,
  newSession,
  priorSession,
  provider,
}: {
  path?: string;
  returned?: unknown;
  newSession?: AuthSession;
  priorSession?: AuthSession;
  provider?: string;
}): AuthAuditEvent | null => {
  if (!path || isError(returned)) return null;

  const signedIn = (method: string): AuthAuditEvent | null => {
    const userId = newSession?.user?.id;
    if (!userId) return null;
    if ((returned as { twoFactorRedirect?: unknown } | null)?.twoFactorRedirect) return null;

    return { userId, action: "auth.sign_in", target: method };
  };

  if (path === "/sign-in/email") return signedIn("Password");
  if (path === "/verify-email") return signedIn("Email confirmation link");
  if (path === "/callback/:id") {
    return signedIn(PROVIDER_NAMES[provider ?? ""] ?? "Another account");
  }

  if (path.startsWith("/two-factor/verify")) {
    const priorUser = priorSession?.user;

    // No session yet: this is the second step of a sign-in
    if (!priorUser?.id) {
      return signedIn(
        path.endsWith("backup-code") ? "Password and backup code" : "Password and two-factor code"
      );
    }

    // Already signed in: the first code after setup is what turns it on
    return priorUser.twoFactorEnabled
      ? null
      : { userId: priorUser.id, action: "two_factor.enabled", target: null };
  }

  const userId = priorSession?.user?.id;
  if (!userId) return null;

  if (path === "/two-factor/disable") {
    return { userId, action: "two_factor.disabled", target: null };
  }
  if (path === "/two-factor/generate-backup-codes") {
    return { userId, action: "two_factor.backup_codes_regenerated", target: null };
  }

  return null;
};
