import type { NodeExecutor } from "@/features/executions/types";

type GoogleFormTriggerExecutor = Record<
  string,
  unknown
>;

export const googleFormTriggerExecutor: NodeExecutor<
  GoogleFormTriggerExecutor
> = async ({
  context,
  step,
}) => {

  const result = await step.run(
    "google-form-trigger",
    async () => context
  );

  return result;
};