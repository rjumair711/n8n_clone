// src/inngest/channels/googleSheets.ts

import { channel, topic } from "@inngest/realtime";

export const SHEETS_CHANNEL_NAME = "google-sheets-execution"; // Unique name for Google Sheets channel

// Create the Google Sheets channel
export const googleSheetsChannel = channel(SHEETS_CHANNEL_NAME)
    .addTopic(
        topic("status").type<{
            nodeId: string;
            status: "loading" | "success" | "error";
            message: string;
        }>()
    )
    .addTopic(
        topic("response").type<{
            nodeId: string;
            sheetId: string;
            rowData: string[];
            responseStatus: "success" | "error";
        }>()
    );