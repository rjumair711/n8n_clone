// "Build with AI" calls a model with one of the user's own stored
// credentials, like every AI node does. Which credential types can be used,
// and the model each one starts with. No server-only imports: the dialog
// uses this too.

import {
  DEDICATED_CHAT_MODEL_NODES,
  getChatModelProvider,
} from "@/features/executions/lib/chat-model-providers";

export const BUILDER_CREDENTIAL_TYPES = [
  "OPENAI",
  "ANTHROPIC",
  "GEMINI",
  "DEEPSEEK",
  "KIMI",
  "QWEN",
  // Any provider of the Chat Model node: OpenRouter, Groq, Ollama ...
  "OPENAI_COMPATIBLE",
] as const;

export type BuilderCredentialType = (typeof BUILDER_CREDENTIAL_TYPES)[number];

export const isBuilderCredentialType = (
  type: string
): type is BuilderCredentialType =>
  (BUILDER_CREDENTIAL_TYPES as readonly string[]).includes(type);

// The same defaults the model nodes use (see lib/connected-model.ts)
const DEFAULT_MODELS: Partial<Record<BuilderCredentialType, string>> = {
  OPENAI: "gpt-4o-mini",
  ANTHROPIC: "claude-sonnet-5-5",
  GEMINI: "gemini-2.5-flash",
};

/**
 * The model used when the Model field is left empty. Empty for a Chat Model
 * provider that has no default: the user has to name one.
 */
export const getBuilderDefaultModel = (
  type: BuilderCredentialType,
  // Only for OPENAI_COMPATIBLE: the Chat Model provider preset
  provider?: string
): string =>
  DEFAULT_MODELS[type] ??
  getChatModelProvider(
    type === "OPENAI_COMPATIBLE" ? provider : DEDICATED_CHAT_MODEL_NODES[type]
  )?.defaultModel ??
  "";
