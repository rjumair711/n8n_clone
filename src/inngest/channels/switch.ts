import { channel, topic } from "@inngest/realtime";

// Define the Switch channel name
export const SWITCH_CHANNEL_NAME = "switch-node-execution";

// Create the Switch channel with status and response topics
export const switchChannel = channel(SWITCH_CHANNEL_NAME)
  .addTopic(
    topic("status").type<{
      nodeId: string;
      status: "loading" | "success" | "error"; // The status of the switch operation
      message: string; // Additional execution details
    }>()
  )
  .addTopic(
    topic("response").type<{
      nodeId: string;
      matchedBranch: string | null; // ID of the winning branch (a rule id or "default")
      switch: {
        matchedBranch: string | null;
        matchedRule?: {
          ruleId: string;
          inputKey?: string;
          operator: string;
          expectedValue?: string;
          actualValue?: unknown;
        } | null;
      };
    }>()
  );
