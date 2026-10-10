import { disposableEmailBlocklistSet } from "disposable-email-domains-js";

// Throwaway mailbox services (mailinator, 10minutemail...) make it free to
// sign up again and again for a new trial. The list comes from the
// disposable-email-domains-js package, which is updated from the community
// blocklist; updating the package updates the list.

let blocklist: Set<string> | undefined;

/**
 * Whether the address is at a known disposable-email domain, or at a
 * subdomain of one. An address without a domain is not: saying what is
 * wrong with it is the sign-up form's job.
 */
export const isDisposableEmail = (email: string): boolean => {
  const domain = email.trim().toLowerCase().split("@").pop() ?? "";
  if (!domain || !email.includes("@")) return false;

  blocklist ??= disposableEmailBlocklistSet();

  // "x.mailinator.com" is checked as itself and as "mailinator.com"
  const labels = domain.replace(/\.+$/, "").split(".");
  for (let start = 0; start < labels.length - 1; start++) {
    if (blocklist.has(labels.slice(start).join("."))) return true;
  }

  return false;
};

export const DISPOSABLE_EMAIL_MESSAGE =
  "Disposable email addresses cannot be used to sign up. Use your regular email address.";
