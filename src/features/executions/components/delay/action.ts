import { getSubscriptionToken, type Realtime } from "@inngest/realtime";
import { inngest } from "@/inngest/client";  // Importing inngest client
import { delayChannel } from "@/inngest/channels/delay";

// Define the Delay Token Type
export type DelayToken = Realtime.Token<
  typeof delayChannel,  // Delay channel type
  ["status", "response"]  // Topics for delay channel
>;

// Fetch Delay Realtime Token Function
export async function fetchDelayRealtimeToken(): Promise<DelayToken> {
  const token = await getSubscriptionToken(inngest, {
    channel: delayChannel(),  // The Delay channel you created
    topics: ["status", "response"],  // Topics to subscribe to
  });
  return token;
}