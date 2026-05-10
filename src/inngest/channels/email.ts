// src/inngest/channels/email.ts

import { channel, topic } from "@inngest/realtime";

export const EMAIL_CHANNEL_NAME = "email-send-execution"; // Unique name for email channel

// Create the Email channel
export const emailChannel = channel(EMAIL_CHANNEL_NAME)
    .addTopic(
        topic("status").type<{
            nodeId: string;
            status: "loading" | "success" | "error";
            message?: string;  // Optional message alongside the status
        }>()
    )
    .addTopic(
        topic("response").type<{
            nodeId: string;
            recipient: string;  // Email recipient
            subject: string;    // Email subject
            body: string;       // Email body content
            responseStatus: "success" | "error";
        }>()
    );