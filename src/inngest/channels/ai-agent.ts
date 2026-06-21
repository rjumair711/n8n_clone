import { channel, topic } from "@inngest/realtime";

export const aiAgentChannel = channel("ai-agent-execution")
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
      type: "LOG" | "ERROR" | "THOUGHT"; // Added "THOUGHT" to stream internal LLM chain reasoning steps live
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
      // Added agent metrics to display in the UI execution logs panel
      metrics?: {
        iterationsUsed: number;
        tokensConsumed?: number;
      };
    }>()
  );