import type { NodeExecutor } from "@/features/executions/types";
import { NonRetriableError } from "inngest";
import { generateText } from "ai";
import { renderTemplate } from "../../lib/templates";
import { getAiUsageScope, recordModelCalls } from "@/lib/ai-usage";
import { withDedicatedProvider } from "../../lib/chat-model-providers";
import { getModelNodeSpecs, loadModelCandidates } from "../../lib/connected-model";
import { createFallbackModel, describeModelAnswer } from "../../lib/model-fallback";
import type { ChatModelData } from "./model";

export {
  createCompatibleChatModel,
  getChatModelUsageProvider,
  type ChatModelData,
} from "./model";

/**
 * The executor for the Chat Model node, or for a node locked to one provider
 * (DeepSeek, Kimi, Qwen) when `nodeType` is given.
 */
const createChatModelExecutor = (
  label: string,
  nodeType?: string
): NodeExecutor<ChatModelData> => async ({
  data: nodeData,
  nodeId,
  userId,
  context,
  step,
  allNodes,
  executionId,
  workflowId,
}) => {
  const data = nodeType ? withDedicatedProvider(nodeType, nodeData) : nodeData;

  if (!data.variableName) {
    throw new NonRetriableError(`${label} node: Variable name is missing`);
  }

  if (!data.userPrompt) {
    throw new NonRetriableError(
      `${label} node: User Prompt is required when the node runs as a step. Connect it to an AI Agent's Chat Model port to use it as the agent's model instead.`
    );
  }

  // The node's own model, then its "Fallback models" in order
  const candidates = await loadModelCandidates({
    label: `${label} node`,
    stepId: `chat-model-${nodeId}-get-credential`,
    specs: getModelNodeSpecs({ type: nodeType ?? "CHAT_MODEL", data: nodeData }),
    userId,
    step,
  });

  const system =
    renderTemplate(data.systemPrompt, context).trim() ||
    "You are a helpful assistant.";
  const prompt = renderTemplate(data.userPrompt, context);

  try {
    const result = await step.run(`chat-model-${nodeId}-generate`, async () => {
      const { model, tracker } = createFallbackModel(candidates);

      try {
        const { text, totalUsage } = await generateText({ model, system, prompt });

        return {
          text,
          usage: {
            inputTokens: totalUsage.inputTokens,
            outputTokens: totalUsage.outputTokens,
            totalTokens: totalUsage.totalTokens,
          },
          // Which model answered, and which ones were tried before it
          ...describeModelAnswer(tracker),
        };
      } finally {
        // Also after a failure: a model that answered an earlier try was paid for
        await recordModelCalls(
          getAiUsageScope({ userId, workflowId, executionId, nodeId, allNodes }),
          tracker
        );
      }
    });

    return {
      ...context,
      [data.variableName]: result,
    };
  } catch (error: any) {
    if (error instanceof NonRetriableError) throw error;

    throw new NonRetriableError(`${label} node failed: ${error.message}`);
  }
};

export const chatModelExecutor = createChatModelExecutor("Chat Model");

export const deepseekExecutor = createChatModelExecutor("DeepSeek", "DEEPSEEK");
export const kimiExecutor = createChatModelExecutor("Kimi", "KIMI");
export const qwenExecutor = createChatModelExecutor("Qwen", "QWEN");
