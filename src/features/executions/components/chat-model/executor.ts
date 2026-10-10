import type { NodeExecutor } from "@/features/executions/types";
import { NonRetriableError } from "inngest";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { safeFetch } from "@/lib/ssrf";
import { renderTemplate } from "../../lib/templates";
import { loadCredentialSecret } from "../../lib/integration";
import { normalizeUsage } from "@/lib/ai-cost";
import { getAiUsageScope, recordAiUsage } from "@/lib/ai-usage";
import {
  resolveChatModelEndpoint,
  withDedicatedProvider,
} from "../../lib/chat-model-providers";

export type ChatModelData = {
  variableName?: string;
  credentialId?: string;
  provider?: string;
  // Only for the "custom" provider, or to point Ollama at another host
  baseUrl?: string;
  model?: string;
  systemPrompt?: string;
  userPrompt?: string;
};

/**
 * Builds the model for an OpenAI-compatible provider. Also used by the AI
 * Agent when a Chat Model node is plugged into its Chat Model port.
 */
export const createCompatibleChatModel = (data: ChatModelData, apiKey: string) => {
  const endpoint = resolveChatModelEndpoint(data);
  if (!endpoint) {
    throw new NonRetriableError(
      `Chat Model node: Unsupported provider "${data.provider}"`
    );
  }

  const { provider, baseUrl: baseURL } = endpoint;
  if (!baseURL) {
    throw new NonRetriableError("Chat Model node: Base URL is required");
  }

  const modelName = data.model?.trim();
  if (!modelName) {
    throw new NonRetriableError("Chat Model node: Model is required");
  }

  return createOpenAI({
    apiKey,
    baseURL,
    name: provider.value,
    // The base URL is typed in by the user, so it gets the same guard as
    // the HTTP Request node
    fetch: safeFetch as unknown as typeof fetch,
    // These providers implement chat completions, not OpenAI's Responses API
  }).chat(modelName);
};

// The provider a Chat Model node's calls are recorded and priced under:
// the preset's name, "custom" for a base URL of the user's own
export const getChatModelUsageProvider = (data: ChatModelData) =>
  resolveChatModelEndpoint(data)?.provider.value ?? "custom";

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

  const apiKey = await loadCredentialSecret({
    step,
    stepId: `chat-model-${nodeId}-get-credential`,
    credentialId: data.credentialId,
    userId,
    label,
  });

  const system =
    renderTemplate(data.systemPrompt, context).trim() ||
    "You are a helpful assistant.";
  const prompt = renderTemplate(data.userPrompt, context);

  try {
    const result = await step.run(`chat-model-${nodeId}-generate`, async () => {
      const { text, totalUsage } = await generateText({
        model: createCompatibleChatModel(data, apiKey),
        system,
        prompt,
      });

      await recordAiUsage({
        scope: getAiUsageScope({ userId, workflowId, executionId, nodeId, allNodes }),
        provider: getChatModelUsageProvider(data),
        model: data.model ?? "",
        usage: normalizeUsage(totalUsage),
      });

      return {
        text,
        usage: {
          inputTokens: totalUsage.inputTokens,
          outputTokens: totalUsage.outputTokens,
          totalTokens: totalUsage.totalTokens,
        },
      };
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
