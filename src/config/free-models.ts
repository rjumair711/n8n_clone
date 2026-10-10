// Which chat models cost nothing to call. The model picker shows a "Free"
// label next to them. This file is the only place that decides it: to mark
// or unmark a model, change it here.
//
// Keyed by the provider's value in
// src/features/executions/lib/chat-model-providers.ts. Model IDs are
// compared without regard to case.
//
// "Free" is the provider's price at the time of writing (checked against
// its pricing page on 2026-10-10). Free tiers have rate limits and change
// without notice: the provider's pricing page is what counts.

export const FREE_MODELS: Record<string, string[]> = {
  // Zhipu's Flash models (docs.z.ai pricing: GLM-4.7-Flash, GLM-4.5-Flash
  // and the vision model GLM-4.6V-Flash are "Free")
  zai: ["glm-4.7-flash", "glm-4.5-flash", "glm-4.6v-flash"],

  // docs.bigmodel.cn lists these three as free text models
  bigmodel: ["glm-4.7-flash", "glm-4.5-flash", "glm-4-flash-250414"],
};

// Providers that mark free models in the ID itself. OpenRouter's free
// variants end in ":free" (for example "some/model:free").
export const FREE_MODEL_SUFFIXES: Record<string, string[]> = {
  openrouter: [":free"],
};

/**
 * Whether the provider offers this model for free, as far as this file
 * knows. A custom provider, or a model that is not listed, is not "paid":
 * it just gets no label.
 */
export const isFreeModel = (
  provider: string | null | undefined,
  model: string | null | undefined
): boolean => {
  const id = (model ?? "").trim().toLowerCase();
  if (!provider || !id) return false;

  return (
    (FREE_MODELS[provider] ?? []).some((free) => free.toLowerCase() === id) ||
    (FREE_MODEL_SUFFIXES[provider] ?? []).some((suffix) => id.endsWith(suffix.toLowerCase()))
  );
};
