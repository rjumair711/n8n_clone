import { channel, topic } from "@inngest/realtime";

// Define the Delay channel name
export const DELAY_CHANNEL_NAME = "delay-node-execution"; 

// Create the Delay channel with status and response topics
export const delayChannel = channel(DELAY_CHANNEL_NAME)
  .addTopic(
    topic("status").type<{
      nodeId: string;
      status: "loading" | "success" | "error";  // The status of the delay operation
      message: string;  // The message that provides additional details
    }>()
  )
  .addTopic(
    topic("response").type<{
      nodeId: string;
      delayAmount: number;  // Delay time (amount)
      delayUnit: "seconds" | "minutes" | "hours";  // Delay unit
    }>()
  );