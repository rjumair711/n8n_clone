// Single sign-on (OpenID Connect): what the settings form sends to Better
// Auth's sso plugin to register an identity provider, and the address the
// provider has to be given. No server imports: the form and the tests use this.

// SAML is not offered yet. The sso plugin of the Better Auth version this
// app is on (1.6.11) reads SAML answers with a version of the samlify
// library that has a known high-severity flaw (GHSA-34r5-q4jw-r36m), and
// samlify's node-forge has one in checking signatures (GHSA-86w9-cpqp-85rv).
// The fixed plugin needs Better Auth 1.7.7. Until that upgrade, nothing of
// SAML can be reached: see isSamlRequest, used in auth.ts.
export const SAML_UNAVAILABLE =
  "SAML sign-on is not available yet. Use OpenID Connect (OIDC), which every major identity provider offers.";

/**
 * Whether a request to the auth server is about SAML: one of the plugin's
 * SAML addresses, or registering or changing a provider with a SAML
 * configuration.
 */
export const isSamlRequest = (path: string | undefined, body: unknown): boolean => {
  if (!path) return false;
  if (path.startsWith("/sso/saml2")) return true;

  return (
    (path === "/sso/register" || path === "/sso/update-provider") &&
    body !== null &&
    typeof body === "object" &&
    (body as { samlConfig?: unknown }).samlConfig != null
  );
};

// How many providers an account may register: a platform admin, and the
// owner of a workspace whose plan includes the enterprise features
export const SSO_ADMIN_PROVIDER_LIMIT = 10;
export const SSO_PLAN_PROVIDER_LIMIT = 3;

// The role someone gets in the workspace of the account that registered
// the provider, when their account is made by signing in through it
export const SSO_JOIN_ROLE = "VIEWER";

// Part of the callback addresses and of the DNS record's name
export const isSsoProviderId = (value: string) => /^[a-z][a-z0-9-]{1,30}$/.test(value);

// example.com, or several separated by commas
export const isSsoDomain = (value: string) =>
  value
    .split(",")
    .every((domain) => /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(domain.trim()));

const isHttpsUrl = (value: string) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

const trimSlash = (value: string) => value.trim().replace(/\/+$/, "");

/**
 * Where the identity provider sends people back to. Given to the provider
 * when the app is registered there.
 */
export const getSsoUrls = (appUrl: string, providerId: string) => ({
  // "Redirect URI" / "Sign-in redirect URI"
  oidcRedirect: `${trimSlash(appUrl)}/api/auth/sso/callback/${providerId}`,
});

export type SsoForm = {
  providerId: string;
  domain: string;
  // The provider's issuer URL
  issuer: string;
  clientId: string;
  clientSecret: string;
};

/**
 * The form as what the plugin's register endpoint takes, or what is wrong
 * with it.
 */
export const buildSsoRegistration = (form: SsoForm, appUrl: string) => {
  const providerId = form.providerId.trim().toLowerCase();
  const domain = form.domain
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .join(",");
  const issuer = form.issuer.trim();

  if (!isSsoProviderId(providerId)) {
    return { error: "Give the provider a short id: lower case letters, digits and -, starting with a letter." };
  }
  if (!domain || !isSsoDomain(domain)) {
    return { error: "Enter the email domain people sign in with, such as example.com." };
  }
  if (!isHttpsUrl(issuer)) return { error: "Enter the issuer URL, starting with https://" };
  if (!form.clientId.trim() || !form.clientSecret.trim()) {
    return { error: "Enter the client ID and the client secret." };
  }

  return {
    body: {
      providerId,
      domain,
      issuer: trimSlash(issuer),
      oidcConfig: {
        clientId: form.clientId.trim(),
        clientSecret: form.clientSecret.trim(),
        pkce: true,
      },
    },
    urls: getSsoUrls(appUrl, providerId),
  };
};

/**
 * The DNS record that proves the domain is the registrant's. The plugin
 * looks for it when "Verify domain" is pressed.
 */
export const getSsoDnsRecord = (providerId: string, domain: string, token: string) => {
  const name = `_better-auth-token-${providerId}`;

  return {
    type: "TXT",
    host: `${name}.${domain.split(",")[0].trim()}`,
    value: `${name}=${token}`,
  };
};
