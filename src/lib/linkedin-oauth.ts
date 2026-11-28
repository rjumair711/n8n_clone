import "server-only";

import { NonRetriableError } from "inngest";
import { getAppUrl } from "./app-url";
import { LINKEDIN_PERSON_SCOPES, LINKEDIN_ORGANIZATION_SCOPES } from "./linkedin-options";

// LinkedIn sign-in for the "LinkedIn account" credential. It needs a
// LinkedIn app (developer.linkedin.com) with the products "Sign In with
// LinkedIn using OpenID Connect" and "Share on LinkedIn", the redirect URL
//   <app URL>/api/oauth/linkedin/callback
// and its client id and secret in LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET.
//
// Posting as a Company Page needs LinkedIn's Community Management API,
// which LinkedIn grants after a review. Only with LINKEDIN_ORGANIZATION_POSTS
// set to "true" are those scopes asked for: LinkedIn refuses the whole
// sign-in when an app asks for a scope it does not have.
//
// LinkedIn's access tokens last 60 days. Refresh tokens are only given to
// LinkedIn's approved partners, so the credential is connected again when
// it expires (its edit page has Reconnect).

export const LINKEDIN_STATE_COOKIE = "linkedin_oauth_state";

const AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";

export const getLinkedinRedirectUri = () => `${getAppUrl()}/api/oauth/linkedin/callback`;

export const linkedinOrganizationPostsEnabled = () =>
  process.env.LINKEDIN_ORGANIZATION_POSTS === "true";

export const getLinkedinScopes = () => [
  ...LINKEDIN_PERSON_SCOPES,
  ...(linkedinOrganizationPostsEnabled() ? LINKEDIN_ORGANIZATION_SCOPES : []),
];

const getClient = () => {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("LinkedIn sign-in is not set up: LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET are missing");
  }

  return { clientId, clientSecret };
};

/** The address to send the user to. */
export const createLinkedinAuthorizationUrl = (state: string) => {
  const { clientId } = getClient();
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", getLinkedinRedirectUri());
  url.searchParams.set("state", state);
  url.searchParams.set("scope", getLinkedinScopes().join(" "));
  return url.toString();
};

// The decrypted value of a LINKEDIN credential
export type LinkedinCredential = {
  accessToken: string;
  // ISO time the access token stops working
  expiresAt: string;
  // The member's id: posts are by urn:li:person:<personId>
  personId: string;
  name: string;
  scopes: string[];
  refreshToken?: string;
  refreshExpiresAt?: string;
};

/**
 * Trades the callback's code for a token, then asks who signed in.
 */
export const exchangeLinkedinCode = async (code: string): Promise<LinkedinCredential> => {
  const { clientId, clientSecret } = getClient();

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: getLinkedinRedirectUri(),
      client_id: clientId,
      client_secret: clientSecret,
    }),
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  const token = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok || typeof token.access_token !== "string") {
    throw new Error(String(token.error_description || token.error || `HTTP ${response.status}`));
  }

  const accessToken = token.access_token;
  const now = Date.now();
  const seconds = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;

  const me = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  const profile = (await me.json().catch(() => ({}))) as Record<string, unknown>;
  if (!me.ok || typeof profile.sub !== "string" || !profile.sub) {
    throw new Error("LinkedIn did not say who signed in. Add the product \"Sign In with LinkedIn using OpenID Connect\" to the LinkedIn app.");
  }

  return {
    accessToken,
    expiresAt: new Date(now + seconds(token.expires_in, 60 * 24 * 60 * 60) * 1000).toISOString(),
    personId: profile.sub,
    name: typeof profile.name === "string" ? profile.name : "",
    scopes: typeof token.scope === "string" ? token.scope.split(/[ ,]+/).filter(Boolean) : getLinkedinScopes(),
    ...(typeof token.refresh_token === "string"
      ? {
          refreshToken: token.refresh_token,
          refreshExpiresAt: new Date(now + seconds(token.refresh_token_expires_in, 365 * 24 * 60 * 60) * 1000).toISOString(),
        }
      : {}),
  };
};

/**
 * The stored credential, checked: still valid, or a clear message to
 * connect it again.
 */
export const readLinkedinCredential = (decrypted: string, now = Date.now()): LinkedinCredential => {
  let stored: LinkedinCredential;
  try {
    stored = JSON.parse(decrypted);
  } catch {
    throw new NonRetriableError("LinkedIn node: Invalid credential format");
  }
  if (!stored?.accessToken || !stored.personId) {
    throw new NonRetriableError("LinkedIn node: the LinkedIn account has to be connected again under Credentials");
  }
  if (stored.expiresAt && Date.parse(stored.expiresAt) <= now) {
    throw new NonRetriableError(
      `LinkedIn node: the LinkedIn sign-in expired on ${stored.expiresAt.slice(0, 10)} (LinkedIn sign-ins last 60 days). Open the credential under Credentials and press Reconnect.`
    );
  }
  return stored;
};
