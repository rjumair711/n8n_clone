import { getSubscriptionToken, type Realtime } from "@inngest/realtime";
import { inngest } from "@/inngest/client";
import { emailChannel } from "@/inngest/channels/email";

// Define Email Token Type
export type EmailToken = Realtime.Token<
  typeof emailChannel, // Email channel type
  ["status", "response"] // Topics for email channel
>;

// Fetch Email Realtime Token Function
export async function fetchEmailRealtimeToken(): Promise<EmailToken> {
  const token = await getSubscriptionToken(inngest, {
    channel: emailChannel(), // The Email channel you created
    topics: ["status", "response"], // Topics you want to subscribe to
  });
  return token;
}