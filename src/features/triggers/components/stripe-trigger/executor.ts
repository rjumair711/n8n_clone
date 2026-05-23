import type { NodeExecutor } from "@/features/executions/types";

type StripeTriggerExecutor = Record<
  string,
  unknown
>;

export const stripeTriggerExecutor: NodeExecutor<
  StripeTriggerExecutor
> = async ({
  context,
  step,
}) => {

  const result = await step.run(
    "stripe-trigger",
    async () => context
  );

  return result;
};