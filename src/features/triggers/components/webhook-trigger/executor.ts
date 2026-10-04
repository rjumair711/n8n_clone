import type { NodeExecutor } from "@/features/executions/types";

type WebhookTriggerData = Record<string, unknown>;

// The request is already in the context as {{webhook.*}} when the run starts
export const webhookTriggerExecutor: NodeExecutor<
  WebhookTriggerData
> = async ({
  context,
  step,
}) => {

  const result = await step.run(
    "webhook-trigger",
    async () => context
  );

  return result;
};
