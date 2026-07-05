import { channel, topic } from "@inngest/realtime"

export const TEXT_FORMATTER_CHANNEL_NAME = "text-formatter-execution"

export const textFormatterChannel = channel(TEXT_FORMATTER_CHANNEL_NAME)
    .addTopic(
        topic("status").type<{
            nodeId: string;
            status: "loading" | "success" | "error";
        }>(),
    )