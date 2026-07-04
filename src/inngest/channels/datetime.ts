import { channel, topic } from "@inngest/realtime"

export const DATE_TIME_CHANNEL_NAME = "date-time-execution"

export const dateTimeChannel = channel(DATE_TIME_CHANNEL_NAME)
    .addTopic(
        topic("status").type<{
            nodeId: string;
            status: "loading" | "success" | "error";
        }>(),
    )