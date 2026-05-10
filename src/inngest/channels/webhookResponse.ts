import { channel, topic } from "@inngest/realtime";

export const WEBHOOK_CHANNEL_NAME = "webhook-response-execution"; // Unique name for webhook channel

// Create the Webhook channel
export const webhookChannel = channel(WEBHOOK_CHANNEL_NAME)
    .addTopic(
        topic("status").type<{
            nodeId: string;
            status: "loading" | "success" | "error";
            message: string;  // Optionally, you could pass a message along with the status
        }>()
    )
    .addTopic(
        topic("response").type<{
            nodeId: string;
            responseMessage: string;
            responseStatus: "success" | "error";
        }>()
    );