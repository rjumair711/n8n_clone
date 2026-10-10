// Who is an admin. No server-only imports: the rules are pure functions so
// they can be tested without a database.

type AdminCandidate = {
  email?: string | null;
  emailVerified?: boolean | null;
};

// ADMIN_EMAILS is comma-separated; case and surrounding spaces do not matter
export const getAdminEmails = () =>
  (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

/**
 * An admin is a user whose email is listed in ADMIN_EMAILS and has been
 * verified. Without the second rule anyone could sign up with an admin's
 * address while verification mail cannot be sent. Google and GitHub
 * sign-ins arrive with emailVerified already set by the provider.
 *
 * This is the only admin check: use it wherever something is admin-only.
 */
export const isAdmin = (user: AdminCandidate | null | undefined) => {
  if (!user?.email || user.emailVerified !== true) return false;

  return getAdminEmails().includes(user.email.trim().toLowerCase());
};

/**
 * Admin actions (publishing, editing and deleting templates) also need
 * two-factor authentication on the admin's account. Strictly true: a
 * missing or null value does not count.
 */
export const canUseAdminActions = (
  user: (AdminCandidate & { twoFactorEnabled?: boolean | null }) | null | undefined
) => isAdmin(user) && user?.twoFactorEnabled === true;

export const ADMIN_TWO_FACTOR_MESSAGE =
  "Turn on two-factor authentication in Settings to manage templates.";

/**
 * The warning to log at startup when password accounts cannot be verified,
 * or null when the setup is fine. Verification mail is sent with Resend.
 */
export const getAdminVerificationWarning = (
  env: Record<string, string | undefined> = process.env
) => {
  if (env.RESEND_API_KEY || env.REQUIRE_EMAIL_VERIFICATION === "false") {
    return null;
  }

  return "[RXJ] RESEND_API_KEY is not set, so verification emails cannot be sent and admin accounts cannot be verified. An address in ADMIN_EMAILS only gets admin rights once its email is verified: set RESEND_API_KEY, or sign in to that account with Google or GitHub.";
};
