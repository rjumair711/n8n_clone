import { channel, topic } from "@inngest/realtime"

export const CALCULATOR_CHANNEL_NAME = "calculator-execution"

export const calculatorChannel = channel(CALCULATOR_CHANNEL_NAME)
    .addTopic(
        topic("status").type<{
            nodeId: string;
            status: "loading" | "success" | "error";
        }>(),
    )