import { getSubscriptionToken, type Realtime } from "@inngest/realtime";
import { inngest } from "@/inngest/client";  // Importing inngest client
import { setVariableChannel } from "@/inngest/channels/set-variable";

// Define the Set Variable Token Type
export type SetVariableToken = Realtime.Token<
  typeof setVariableChannel,  // Set Variable channel type
  ["status", "response"]  // Topics for set variable channel
>;

// Fetch Set Variable Realtime Token Function
export async function fetchSetVariableRealtimeToken(): Promise<SetVariableToken> {
  const token = await getSubscriptionToken(inngest, {
    channel: setVariableChannel(),  // The Set Variable channel you created
    topics: ["status", "response"],  // Topics you want to subscribe to
  });
  return token;
}