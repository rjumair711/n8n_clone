// Providers that speak the OpenAI chat completions API. No server-only
// imports: the node's dialog uses this list too.

export type ChatModelProvider = {
  value: string;
  label: string;
  // Empty for "custom", where the user types the URL
  baseUrl: string;
  modelPlaceholder: string;
  // Used by the provider's own node when its Model field is left empty
  defaultModel?: string;
};

export const CHAT_MODEL_PROVIDERS: ChatModelProvider[] = [
  {
    value: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    modelPlaceholder: "openai/gpt-4o-mini",
  },
  {
    value: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    modelPlaceholder: "llama-3.3-70b-versatile",
  },
  {
    value: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    modelPlaceholder: "deepseek-chat",
    defaultModel: "deepseek-chat",
  },
  {
    value: "kimi",
    label: "Kimi (Moonshot AI)",
    baseUrl: "https://api.moonshot.ai/v1",
    modelPlaceholder: "moonshot-v1-8k",
    defaultModel: "moonshot-v1-8k",
  },
  {
    value: "qwen",
    label: "Qwen (Alibaba Cloud)",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    modelPlaceholder: "qwen-plus",
    defaultModel: "qwen-plus",
  },
  {
    value: "mistral",
    label: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    modelPlaceholder: "mistral-small-latest",
  },
  {
    value: "together",
    label: "Together AI",
    baseUrl: "https://api.together.xyz/v1",
    modelPlaceholder: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  },
  {
    value: "ollama",
    label: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    modelPlaceholder: "llama3.2",
  },
  {
    value: "custom",
    label: "Custom (OpenAI-compatible)",
    baseUrl: "",
    modelPlaceholder: "model-name",
  },
];

export const getChatModelProvider = (value?: string) =>
  CHAT_MODEL_PROVIDERS.find((provider) => provider.value === value);

// Node types that are a Chat Model node locked to one provider
export const DEDICATED_CHAT_MODEL_NODES: Record<string, string> = {
  DEEPSEEK: "deepseek",
  KIMI: "kimi",
  QWEN: "qwen",
};

/**
 * A model node's settings as the Chat Model code expects them: a DeepSeek,
 * Kimi or Qwen node gets its provider and default model filled in.
 */
export const withDedicatedProvider = <T extends Record<string, any>>(
  nodeType: string,
  data: T
): T => {
  const provider = getChatModelProvider(DEDICATED_CHAT_MODEL_NODES[nodeType]);
  if (!provider) return data;

  return {
    ...data,
    provider: provider.value,
    model: data.model?.trim() || provider.defaultModel,
  };
};
