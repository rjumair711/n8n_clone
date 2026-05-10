import { channel, topic } from "@inngest/realtime";

// Define the Filter channel name
export const FILTER_CHANNEL_NAME = "filter-node-execution"; 

// Create the Filter channel with status and response topics
export const filterChannel = channel(FILTER_CHANNEL_NAME)
    .addTopic(
        topic("status").type<{
            nodeId: string;
            status: "loading" | "success" | "error"; // The status of the filter operation
            message: string;  // The message that provides additional details
        }>()
    )
    .addTopic(
        topic("response").type<{
            nodeId: string;
            filterPassed: boolean;  // Whether the filter condition passed or not
            filter: {
                inputKey: string;
                operator: string;
                expectedValue: string;
                actualValue: unknown;
                passed: boolean;
            };
        }>()
    );