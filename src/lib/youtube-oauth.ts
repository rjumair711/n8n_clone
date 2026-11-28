import "server-only";

import { google } from "googleapis";
import { NonRetriableError } from "inngest";
import { getAppUrl } from "./app-url";

// "Connect YouTube": a credential of its own, so only people who connect
// YouTube are asked for YouTube's permissions; the "Google account"
// credential (Gmail, Sheets, Drive...) is unchanged. It uses the same
// Google OAuth client (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET), with one
// more authorised redirect URI:
//   <app URL>/api/oauth/youtube/callback
// The YouTube Data API v3 has to be enabled in that Google Cloud project.
//
// Google keeps videos uploaded by an unverified app private until the app
// has passed Google's audit for the YouTube API.

export const YOUTUBE_STATE_COOKIE = "youtube_oauth_state";

export const YOUTUBE_SCOPES = [
  "openid",
  "email",
  // Upload videos
  "https://www.googleapis.com/auth/youtube.upload",
  // Read the channel, change videos' details and thumbnails, read and reply to comments
  "https://www.googleapis.com/auth/youtube.force-ssl",
];

export const getYoutubeRedirectUri = () => `${getAppUrl()}/api/oauth/youtube/callback`;

export const createYoutubeOAuthClient = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("YouTube sign-in is not set up: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are missing");
  }

  return new google.auth.OAuth2(clientId, clientSecret, getYoutubeRedirectUri());
};

// The decrypted value of a YOUTUBE credential
export type YoutubeCredential = {
  refreshToken: string;
  email?: string;
  channelId: string;
  channelTitle: string;
};

/** An OAuth client that refreshes its access token from the stored refresh token. */
export const getYoutubeAuth = (decrypted: string) => {
  let stored: YoutubeCredential;
  try {
    stored = JSON.parse(decrypted);
  } catch {
    throw new NonRetriableError("YouTube node: Invalid credential format");
  }
  if (!stored?.refreshToken) {
    throw new NonRetriableError("YouTube node: the YouTube channel has to be connected again under Credentials");
  }

  const client = createYoutubeOAuthClient();
  client.setCredentials({ refresh_token: stored.refreshToken });
  return { auth: client, credential: stored };
};
