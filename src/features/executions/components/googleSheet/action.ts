// src/inngest/actions/googleSheets.ts

import { getSubscriptionToken, type Realtime } from "@inngest/realtime";
import { inngest } from "@/inngest/client";
import { googleSheetsChannel } from "@/inngest/channels/googleSheet";

// Define Google Sheets Token Type
export type GoogleSheetsToken = Realtime.Token<
  typeof googleSheetsChannel, // Google Sheets channel type
  ["status", "response"] // Topics for Google Sheets channel
>;

// Fetch Google Sheets Realtime Token Function
export async function fetchGoogleSheetsRealtimeToken(): Promise<GoogleSheetsToken> {
  const token = await getSubscriptionToken(inngest, {
    channel: googleSheetsChannel(),  // The Google Sheets channel you created
    topics: ["status", "response"],  // Topics you want to subscribe to
  });
  return token;
}