import { NodeExecutor } from "../../types";
import { NonRetriableError } from "inngest";

type DelayData = {
  delayAmount: number;
  delayUnit: "seconds" | "minutes" | "hours";
};

export const delayExecutor: NodeExecutor<DelayData> = async ({
  data,
  nodeId,
  context,
  step,
}) => {

  const { delayAmount, delayUnit } = data;

  // Validation
  if (!delayAmount || !delayUnit) {
    throw new NonRetriableError(
      "Delay node requires delayAmount and delayUnit"
    );
  }

  // Convert to Inngest duration format
  const unitMap: Record<string, string> = {
    seconds: "s",
    minutes: "m",
    hours: "h",
  };

  const duration = `${delayAmount}${unitMap[delayUnit]}`;

  console.log(`Inngest sleeping for ${duration}...`);

  // Proper Inngest delay
  await step.sleep(
    `sleep-node-${nodeId}`,
    duration
  );

  console.log(`Delay of ${duration} completed.`);

  return context;
};