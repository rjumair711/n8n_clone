import { getSubscriptionToken, type Realtime } from "@inngest/realtime";
import { inngest } from "@/inngest/client";
import { webhookChannel } from "@/inngest/channels/webhookResponse";

// Define Webhook Token Type
export type WebhookToken = Realtime.Token<
    typeof webhookChannel,  // Webhook channel type
    ["status", "response"]  // Topics for webhook channel
>;

// Fetch Webhook Realtime Token Function
export async function fetchWebhookRealtimeToken(): Promise<WebhookToken> {
    const token = await getSubscriptionToken(inngest, {
        channel: webhookChannel(),  // The Webhook channel you created
        topics: ["status", "response"],  // Topics you want to subscribe to
    });
    return token;
}