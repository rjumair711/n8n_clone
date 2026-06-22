// src/inngest/channels/googleCalendar.ts

import { channel, topic } from "@inngest/realtime";
export const CALENDAR_CHANNEL_NAME = "google-calendar-execution"; 

// Create the Google Calendar channel
export const googleCalendarChannel = channel(CALENDAR_CHANNEL_NAME)
    .addTopic(
        topic("status").type<{
            nodeId: string;
            status: "loading" | "success" | "error";
            message?: string;
        }>()
    )
    .addTopic(
        topic("response").type<{
            nodeId: string;
            eventId?: string;
            htmlLink?: string;
            responseStatus: "success" | "error";
        }>()
    );