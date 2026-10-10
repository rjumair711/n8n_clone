// Providers that speak the OpenAI chat completions API. No server-only
// imports: the node's dialog uses this list too.
//
// Each base URL and model below was checked against the provider's own
// documentation on 2026-10-10, except where a comment says otherwise.
// Providers rename and retire models often: the "Load models" button asks
// the provider itself, and these lists are what it falls back to.

export type ChatModelProvider = {
  value: string;
  label: string;
  // Empty for "custom", where the user types the URL
  baseUrl: string;
  modelPlaceholder: string;
  // Used by the provider's own node when its Model field is left empty
  defaultModel?: string;
  // Suggested in the dialog, and shown when the provider's own list cannot
  // be loaded
  models: string[];
};

export const CHAT_MODEL_PROVIDERS: ChatModelProvider[] = [
  {
    value: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    modelPlaceholder: "~openai/gpt-sol-latest",
    // The "latest" aliases of OpenRouter's quickstart
    models: ["~openai/gpt-sol-latest", "~anthropic/claude-sonnet-latest"],
  },
  {
    value: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    modelPlaceholder: "llama-3.3-70b-versatile",
    // Groq's compatibility page names no model: use Load models
    models: [],
  },
  {
    value: "together",
    label: "Together AI",
    baseUrl: "https://api.together.ai/v1",
    modelPlaceholder: "MiniMaxAI/MiniMax-M3",
    models: ["MiniMaxAI/MiniMax-M3"],
  },
  {
    value: "mistral",
    label: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    modelPlaceholder: "mistral-small-latest",
    models: ["mistral-small-latest", "mistral-large-latest"],
  },
  {
    value: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    modelPlaceholder: "deepseek-flash",
    defaultModel: "deepseek-flash",
    models: ["deepseek-flash", "deepseek-v4-pro"],
  },
  {
    value: "zai",
    label: "Zhipu Z.ai (international)",
    baseUrl: "https://api.z.ai/api/paas/v4",
    modelPlaceholder: "glm-5.3",
    models: [
      "glm-5.3",
      "glm-5.3-flash",
      "glm-5.2",
      "glm-4.7",
      "glm-4.7-flash",
      "glm-4.5-flash",
    ],
  },
  {
    value: "bigmodel",
    label: "Zhipu BigModel (China)",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    modelPlaceholder: "glm-5.3",
    models: [
      "glm-5.3",
      "glm-5.3-flash",
      "glm-5.2",
      "glm-4.7",
      "glm-4.7-flash",
      "glm-4.5-flash",
      "glm-4-flash-250414",
    ],
  },
  {
    value: "minimax",
    label: "MiniMax (international)",
    baseUrl: "https://api.minimax.io/v1",
    modelPlaceholder: "MiniMax-M3",
    models: ["MiniMax-M3", "MiniMax-M2.7", "MiniMax-M2.7-highspeed"],
  },
  {
    value: "minimax-cn",
    label: "MiniMax (China)",
    // From the search summary of platform.minimaxi.com's "OpenAI API
    // compatible" page; the page itself could not be opened
    baseUrl: "https://api.minimaxi.com/v1",
    modelPlaceholder: "MiniMax-M2.7",
    models: ["MiniMax-M2.7", "MiniMax-M2.7-highspeed"],
  },
  {
    value: "volcengine",
    label: "ByteDance Volcengine Ark (Doubao)",
    // From the search summary of Volcengine's "compatible with the OpenAI
    // SDK" page; the page itself came back empty. The model IDs are examples
    // from third-party guides: the console lists the ones an account can
    // use, and an endpoint ID ("ep-...") works in their place.
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    modelPlaceholder: "doubao-seed-2-0-pro-260215 or ep-...",
    models: ["doubao-seed-2-0-pro-260215", "doubao-seed-1-6-251015"],
  },
  {
    value: "xiaomi-mimo",
    label: "Xiaomi MiMo",
    baseUrl: "https://api.xiaomimimo.com/v1",
    modelPlaceholder: "mimo-v2.6-pro",
    models: ["mimo-v2.6-pro"],
  },
  {
    value: "siliconflow",
    label: "SiliconFlow (international)",
    baseUrl: "https://api.siliconflow.com/v1",
    modelPlaceholder: "Qwen/Qwen3-32B",
    models: ["Qwen/Qwen3-32B"],
  },
  {
    value: "siliconflow-cn",
    label: "SiliconFlow (China)",
    baseUrl: "https://api.siliconflow.cn/v1",
    modelPlaceholder: "deepseek-ai/DeepSeek-V4-Flash",
    models: ["deepseek-ai/DeepSeek-V4-Flash", "moonshotai/Kimi-K2.7-Code"],
  },
  {
    value: "kimi",
    label: "Kimi (Moonshot AI)",
    baseUrl: "https://api.moonshot.ai/v1",
    modelPlaceholder: "kimi-k2.6",
    // The current K2 model. Moonshot's flagship is kimi-k3; the moonshot-v1
    // models were discontinued on 2026-08-31.
    defaultModel: "kimi-k2.6",
    models: ["kimi-k2.6", "kimi-k3", "kimi-k2.7-code"],
  },
  {
    value: "qwen",
    label: "Qwen (Alibaba Cloud)",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    // Not checked for this change: as it was
    modelPlaceholder: "qwen-plus",
    defaultModel: "qwen-plus",
    models: ["qwen-plus", "qwen-turbo"],
  },
  {
    value: "ollama",
    label: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    modelPlaceholder: "llama3.2",
    // Whatever has been pulled on that machine: use Load models
    models: [],
  },
  {
    value: "custom",
    label: "Custom base URL (OpenAI-compatible)",
    baseUrl: "",
    modelPlaceholder: "model-name",
    models: [],
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

/**
 * The provider and base URL a model node's settings mean: the URL typed in
 * (or the region picked) when there is one, the preset's otherwise. The
 * Chat Model node without a provider is an OpenRouter one, as it always was.
 * Null when the provider is not known.
 */
export const resolveChatModelEndpoint = (data: {
  provider?: string | null;
  baseUrl?: string | null;
}): { provider: ChatModelProvider; baseUrl: string } | null => {
  const provider = getChatModelProvider(data.provider || "openrouter");
  if (!provider) return null;

  return {
    provider,
    baseUrl: (data.baseUrl?.trim() || provider.baseUrl).replace(/\/+$/, ""),
  };
};

// Hosts that handle requests on servers in mainland China, by the
// provider's own description of the endpoint (its China platform, or a
// China region) or, for DeepSeek, its privacy policy.
const MAINLAND_CHINA_HOSTS = [
  "open.bigmodel.cn",
  "api.minimaxi.com",
  "ark.cn-beijing.volces.com",
  "api.siliconflow.cn",
  "api.deepseek.com",
  "api.moonshot.cn",
  "dashscope.aliyuncs.com",
];

export const CHINA_DATA_NOTE = "Data processed in China";

/**
 * Whether requests to this base URL are processed in mainland China, as far
 * as the list above knows. A custom URL that is not on it gets no note,
 * which is not a statement about where it is.
 */
export const isProcessedInChina = (baseUrl: string | null | undefined): boolean => {
  try {
    const host = new URL(baseUrl ?? "").hostname.toLowerCase();

    return MAINLAND_CHINA_HOSTS.some(
      (china) => host === china || host.endsWith(`.${china}`)
    );
  } catch {
    return false;
  }
};

// Model IDs that nodes saved earlier may still hold, and what the provider's
// documentation says happened to them. The dialog shows the note; the node
// is not changed for the user, because a different model has a different
// price.
const RETIRED_MODELS: Record<string, Record<string, string>> = {
  kimi: Object.fromEntries(
    [
      "moonshot-v1-8k",
      "moonshot-v1-32k",
      "moonshot-v1-128k",
      "moonshot-v1-auto",
      "kimi-k2.5",
    ]
      .map((model): [string, string] => [model, "Moonshot discontinued this model on 31 August 2026."])
      .concat(
        [
          "kimi-k2-0905-preview",
          "kimi-k2-0711-preview",
          "kimi-k2-turbo-preview",
          "kimi-k2-thinking",
          "kimi-k2-thinking-turbo",
        ].map((model): [string, string] => [model, "Moonshot discontinued this model on 25 May 2026."])
      )
  ),
  deepseek: {
    "deepseek-chat": "DeepSeek announced that this name would be discontinued on 24 July 2026.",
    "deepseek-reasoner": "DeepSeek announced that this name would be discontinued on 24 July 2026.",
  },
};

/**
 * What to tell the user about a model ID the provider has retired, or null.
 */
export const getRetiredModelNote = (
  provider: string | null | undefined,
  model: string | null | undefined
): string | null => {
  const note = RETIRED_MODELS[provider ?? ""]?.[(model ?? "").trim().toLowerCase()];
  const current = getChatModelProvider(provider ?? "")?.defaultModel;

  return note ? `${note}${current ? ` Use a current one, for example ${current}.` : ""}` : null;
};

// The most model IDs kept from a provider's list (OpenRouter has hundreds)
const MAX_LISTED_MODELS = 1000;

/**
 * The model IDs in a provider's answer to GET /models. OpenAI's shape is
 * `{ data: [{ id }] }`; some compatible servers answer `{ models: [...] }`
 * or a bare list, with `id`, `name` or `model` naming the model.
 */
export const parseModelList = (body: unknown): string[] => {
  const container = body as { data?: unknown; models?: unknown } | null;

  const list = Array.isArray(body)
    ? body
    : Array.isArray(container?.data)
      ? container.data
      : Array.isArray(container?.models)
        ? container.models
        : [];

  const ids = new Set<string>();

  for (const entry of list) {
    const id =
      typeof entry === "string"
        ? entry
        : (entry as { id?: unknown; name?: unknown; model?: unknown } | null)?.id ??
          (entry as { name?: unknown } | null)?.name ??
          (entry as { model?: unknown } | null)?.model;

    if (typeof id === "string" && id.trim() && id.length <= 200) ids.add(id.trim());
  }

  return [...ids].sort((a, b) => a.localeCompare(b)).slice(0, MAX_LISTED_MODELS);
};
