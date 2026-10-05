import "server-only";

import { google } from "googleapis";
import { NonRetriableError } from "inngest";
import { decrypt } from "./encryption";
import { getAppUrl } from "./app-url";

export { getAppUrl };

// What a "Google account" credential may do. Gmail scopes are restricted:
// until Google has verified the OAuth app, only test users added in the
// Google Cloud console can sign in.
export const GOOGLE_OAUTH_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/calendar.events",
  // Full Drive access: the Google Drive node finds and downloads files the
  // user already has, which the narrower drive.file scope does not allow
  "https://www.googleapis.com/auth/drive",
];

export const GOOGLE_OAUTH_STATE_COOKIE = "google_oauth_state";

// Must be listed under "Authorised redirect URIs" of the OAuth client
export const getGoogleRedirectUri = () =>
  `${getAppUrl()}/api/oauth/google/callback`;

export const createGoogleOAuthClient = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not configured"
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, getGoogleRedirectUri());
};

// The decrypted value of a GOOGLE_OAUTH2 credential
export type GoogleOAuthCredential = {
  refreshToken: string;
  email?: string;
  scope?: string;
};

/**
 * An OAuth client that refreshes its access token from the stored refresh
 * token. `encryptedValue` is the credential row's value.
 */
export const getGoogleAuthFromCredential = (
  label: string,
  encryptedValue: string
) => {
  let stored: GoogleOAuthCredential;

  try {
    stored = JSON.parse(decrypt(encryptedValue));
  } catch {
    throw new NonRetriableError(`${label} node: Invalid credential format`);
  }

  if (!stored.refreshToken) {
    throw new NonRetriableError(
      `${label} node: the Google account has to be connected again`
    );
  }

  const client = createGoogleOAuthClient();
  client.setCredentials({ refresh_token: stored.refreshToken });

  return client;
};

/**
 * Auth for the Google nodes that accept either kind of credential: a
 * "Google account" (OAuth sign-in) or the older service account.
 */
export const getGoogleAuth = (
  label: string,
  credential: { type: string; value: string },
  scopes: string[]
) => {
  if (credential.type === "GOOGLE_OAUTH2") {
    return getGoogleAuthFromCredential(label, credential.value);
  }

  let serviceAccount: {
    clientEmail?: string;
    privateKey?: string;
    projectId?: string;
  };

  try {
    serviceAccount = JSON.parse(decrypt(credential.value));
  } catch {
    throw new NonRetriableError(`${label} node: Invalid credential format`);
  }

  if (!serviceAccount.clientEmail || !serviceAccount.privateKey) {
    throw new NonRetriableError(`${label} node: Invalid credential format`);
  }

  return new google.auth.GoogleAuth({
    credentials: {
      client_email: serviceAccount.clientEmail,
      private_key: serviceAccount.privateKey.replace(/\\n/g, "\n"),
      project_id: serviceAccount.projectId,
    },
    scopes,
  });
};
