import { NodeExecutor } from "@/features/executions/types";
import { bufferMemoryChannel } from "@/inngest/channels/bufferMemory";

// 1. Define the missing data interface for this node type
type BufferMemoryData = {
  sessionId?: string;
  windowSize?: number;
};

export const bufferMemoryExecutor: NodeExecutor<BufferMemoryData> = async (params: any) => {
  // 2. Destructure 'context' alongside your other parameter objects
  const { data, nodeId, executionId, step, publish, context } = params;
  const timestamp = new Date().toISOString();

  try {
    // Stream "Loading" status to the canvas UI
    if (publish) {
      await publish(
        bufferMemoryChannel().status({
          executionId,
          nodeId,
          status: "loading",
        })
      );
    }

    // Stream an execution log step (Added required timestamp)
    if (publish) {
      await publish(
        bufferMemoryChannel().log({
          executionId,
          nodeId,
          type: "LOG",
          message: "Accessing buffer memory stream...",
          timestamp, // 👈 Fixed: Added missing required field
        })
      );
    }

    // --- [Your core memory processing logic goes here] ---

    // Stream Success status (Changed "completed" to "success")
    if (publish) {
      await publish(
        bufferMemoryChannel().status({
          executionId,
          nodeId,
          status: "success", // 👈 Fixed: Value matches your channel schema
        })
      );
    }

    // 3. Return the context token to satisfy the NodeExecutor signature type
    return context; // 👈 Fixed: Prevents the Promise<void> assignment error

  } catch (error: any) {
    // Stream Error status logs (Added required timestamp)
    if (publish) {
      await publish(
        bufferMemoryChannel().log({
          executionId,
          nodeId,
          type: "ERROR",
          message: error.message || "Failed to execute buffer memory node",
          timestamp, // 👈 Fixed: Added missing required field
        })
      );
    }
    throw error;
  }
};