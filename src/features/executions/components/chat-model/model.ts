import { NonRetriableError } from "inngest";
import { createOpenAI } from "@ai-sdk/openai";
import { safeFetch } from "@/lib/ssrf";
import { resolveChatModelEndpoint } from "../../lib/chat-model-providers";

export type ChatModelData = {
  variableName?: string;
  credentialId?: string;
  provider?: string;
  // Only for the "custom" provider, or to point Ollama at another host
  baseUrl?: string;
  model?: string;
  systemPrompt?: string;
  userPrompt?: string;
  // "Fallback models": a JSON list, see lib/model-fallback.ts
  fallbackModels?: string;
  fallbackTimeoutSeconds?: string;
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
