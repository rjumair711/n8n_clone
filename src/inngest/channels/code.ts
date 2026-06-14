import { channel, topic } from "@inngest/realtime";

export const codeChannel = channel("code-execution")
  .addTopic(
    topic("status").type<{
      executionId: string;
      nodeId: string;
      status: "loading" | "success" | "error";
      message?: string; // Clear "known properties" assignment error
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
  )
  .addTopic(
    topic("response").type<{
      executionId: string;
      nodeId: string;
      variableName: string;
      output: any;
      logs: string[];
      responseStatus: "success" | "error";
    }>()
  );