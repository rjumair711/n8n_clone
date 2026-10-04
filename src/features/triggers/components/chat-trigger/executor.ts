import type { NodeExecutor } from "@/features/executions/types";

type ChatTriggerData = Record<string, unknown>;

// The message is already in the context as {{chatInput}} and {{sessionId}}
export const chatTriggerExecutor: NodeExecutor<
  ChatTriggerData
> = async ({
  context,
  step,
}) => {

  const result = await step.run(
    "chat-trigger",
    async () => context
  );

  return result;
};
