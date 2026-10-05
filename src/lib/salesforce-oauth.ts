import "server-only";

import { createHash, randomBytes } from "crypto";
import { NonRetriableError } from "inngest";
import { decrypt } from "./encryption";
import { getAppUrl } from "./app-url";

// Salesforce sign-in for the "Salesforce account" credential. It needs a
// Connected App (or External Client App) in a Salesforce org, with:
//   - callback URL  <app URL>/api/oauth/salesforce/callback
//   - OAuth scopes  "Manage user data via APIs (api)" and
//                   "Perform requests at any time (refresh_token, offline_access)"
// and its consumer key and secret in SALESFORCE_CLIENT_ID / SALESFORCE_CLIENT_SECRET.

export const SALESFORCE_STATE_COOKIE = "salesforce_oauth_state";
export const SALESFORCE_API_VERSION = "v60.0";

const SALESFORCE_SCOPES = "api refresh_token offline_access";

const LOGIN_URLS = {
  production: "https://login.salesforce.com",
  sandbox: "https://test.salesforce.com",
} as const;

export type SalesforceEnvironment = keyof typeof LOGIN_URLS;

export const getSalesforceRedirectUri = () =>
  `${getAppUrl()}/api/oauth/salesforce/callback`;

const getClient = () => {
  const clientId = process.env.SALESFORCE_CLIENT_ID;
  const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "SALESFORCE_CLIENT_ID and SALESFORCE_CLIENT_SECRET are not configured"
    );
  }

  return { clientId, clientSecret };
};

// Tokens are only ever sent to, and API calls only made on, Salesforce's
// own domains
const isSalesforceUrl = (value: string) => {
  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      /(^|\.)(salesforce|force)\.com$/i.test(url.hostname)
    );
  } catch {
    return false;
  }
};

/**
 * Starts the sign-in: the URL to send the user to, and the PKCE verifier to
 * keep (in a cookie) until Salesforce calls back.
 */
export const createSalesforceAuthorization = (
  environment: SalesforceEnvironment,
  state: string
) => {
  const { clientId } = getClient();

  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  const url = new URL(`${LOGIN_URLS[environment]}/services/oauth2/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", getSalesforceRedirectUri());
  url.searchParams.set("scope", SALESFORCE_SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  // Always show the login page, so the user picks which org to connect
  url.searchParams.set("prompt", "login consent");

  return { url: url.toString(), codeVerifier };
};

// The decrypted value of a SALESFORCE credential
export type SalesforceCredential = {
  refreshToken: string;
  instanceUrl: string;
  environment: SalesforceEnvironment;
};

const requestToken = async (
  environment: SalesforceEnvironment,
  params: Record<string, string>
) => {
  const { clientId, clientSecret } = getClient();

  const response = await fetch(
    `${LOGIN_URLS[environment] ?? LOGIN_URLS.production}/services/oauth2/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        ...params,
        client_id: clientId,
        client_secret: clientSecret,
      }),
      signal: AbortSignal.timeout(20_000),
    }
  );

  const body = (await response.json().catch(() => ({}))) as Record<string, string>;

  if (!response.ok || !body.access_token) {
    const error = new Error(
      body.error_description || body.error || `HTTP ${response.status}`
    ) as Error & { code?: string };
    error.code = body.error;
    throw error;
  }

  if (!isSalesforceUrl(body.instance_url)) {
    throw new Error("Salesforce returned an unexpected instance address");
  }

  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token as string | undefined,
    instanceUrl: body.instance_url.replace(/\/+$/, ""),
  };
};

// Used by the callback route
export const exchangeSalesforceCode = (
  environment: SalesforceEnvironment,
  code: string,
  codeVerifier: string
) =>
  requestToken(environment, {
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier,
    redirect_uri: getSalesforceRedirectUri(),
  });

/**
 * A fresh access token for a stored credential. `encryptedValue` is the
 * credential row's value.
 */
export const getSalesforceAccess = async (encryptedValue: string) => {
  let stored: SalesforceCredential;

  try {
    stored = JSON.parse(decrypt(encryptedValue));
  } catch {
    throw new NonRetriableError("Salesforce node: Invalid credential format");
  }

  if (!stored.refreshToken) {
    throw new NonRetriableError(
      "Salesforce node: the Salesforce account has to be connected again"
    );
  }

  try {
    const token = await requestToken(stored.environment, {
      grant_type: "refresh_token",
      refresh_token: stored.refreshToken,
    });

    return { accessToken: token.accessToken, instanceUrl: token.instanceUrl };
  } catch (error: any) {
    throw new NonRetriableError(
      error?.code === "invalid_grant"
        ? "Salesforce node: access was revoked or expired. Connect the Salesforce account again under Credentials."
        : `Salesforce node: could not sign in to Salesforce (${error?.message})`
    );
  }
};
