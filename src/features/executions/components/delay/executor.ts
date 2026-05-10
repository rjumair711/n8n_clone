import { NodeExecutor } from "../../types";
import { NonRetriableError } from "inngest"; // Ensure proper error handling
import { delayChannel } from "@/inngest/channels/delay"; // Import the delay channel

type DelayData = {
  delayAmount: number;  // The amount of time to wait
  delayUnit: "seconds" | "minutes" | "hours";  // The unit of time (seconds, minutes, hours)
};

export const delayExecutor: NodeExecutor<DelayData> = async ({
  data,
  nodeId,
  context,
  publish,
  step // Make sure step is destructured here
}) => {
  const { delayAmount, delayUnit } = data;

  // FIX: Merge the ID into the event object inside the publish call
  await publish({
    ...delayChannel().status({
      nodeId: nodeId,
      status: "loading",
      message: "Processing delay..."
    }),
    id: `delay-loading-${nodeId}-${Date.now()}` // Unique ID for idempotency
  });

  if (!delayAmount || !delayUnit) {
    throw new NonRetriableError("Delay node requires delayAmount and delayUnit");
  }

  // Convert unit to Inngest-compatible string (e.g., "5s", "10m", "1h")
  const unitMap: Record<string, string> = {
    seconds: "s",
    minutes: "m",
    hours: "h"
  };
  const duration = `${delayAmount}${unitMap[delayUnit]}`;

  console.log(`Inngest sleeping for ${duration}...`);

  // FIX: Use step.sleep instead of setTimeout
  // This is the correct way to handle delays in Inngest
  await step.sleep(`sleep-node-${nodeId}`, duration);

  console.log(`Delay of ${duration} completed.`);

  // Success Status
  await publish({
    ...delayChannel().status({
      nodeId: nodeId,
      status: "success",
      message: `Delay of ${delayAmount} ${delayUnit} completed`
    }),
    id: `delay-success-${nodeId}`
  });

  return context;
};