import { PRIVATE_KEYS } from "@/features/templates/lib/template-data";

// Settings the model never sees and never sets: stored credentials, secrets
// and things that only exist in the user's account. The template rules
// (PRIVATE_KEYS) plus every key that is named like one of them, so a node
// added later is covered without being listed.
const PRIVATE_KEY_PATTERN =
  /(credentialid|secret|password|apikey|webhookurl|token)$/i;

// The AI Agent's per-tool settings are keyed by node id; they are kept as
// they are and not shown to the model
const HIDDEN_KEYS = new Set(["toolSettings"]);

export const isPrivateKey = (key: string) =>
  PRIVATE_KEYS.has(key) || PRIVATE_KEY_PATTERN.test(key);

/**
 * A node's settings as the model may see them. Also applied to what the
 * model sends back, so it cannot set any of them.
 */
export const hidePrivateSettings = (
  data: Record<string, unknown>
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(data).filter(
      ([key]) => !isPrivateKey(key) && !HIDDEN_KEYS.has(key)
    )
  );
