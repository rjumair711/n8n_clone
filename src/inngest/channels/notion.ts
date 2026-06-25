import { channel, topic } from "@inngest/realtime";

export const notionChannel = channel("notion-execution")
  .addTopic(
    topic("status").type<{
      executionId: string;
      nodeId: string;
      status: "loading" | "success" | "error";
      message?: string;
    }>()
  )
  .addTopic(
    topic("log").type<{
      executionId: string;
      nodeId: string;
      type: "LOG" | "ERROR";
      message: string;
      timestamp: string;
    }>()
  );