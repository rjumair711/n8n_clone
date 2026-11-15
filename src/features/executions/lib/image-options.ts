// The providers and request rules of the Image Generation node. No
// server-only imports: the node dialog uses it too.

export type ImageProvider = {
  value: string;
  label: string;
  // Empty for "custom", where the user types the URL
  baseUrl: string;
  // Used when the Model field is left empty; none means it must be set
  model: string;
};

export const IMAGE_PROVIDERS: ImageProvider[] = [
  { value: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-image-1" },
  { value: "custom", label: "OpenAI-compatible (custom base URL)", baseUrl: "", model: "" },
];

export const IMAGE_PROMPT_MAX = 4000;

export const IMAGE_SIZES = [
  { value: "1024x1024", label: "Square (1024 × 1024)" },
  { value: "1536x1024", label: "Landscape (1536 × 1024)" },
  { value: "1024x1536", label: "Portrait (1024 × 1536)" },
  { value: "auto", label: "Auto (the model decides)" },
];

export const IMAGE_QUALITIES = [
  { value: "auto", label: "Auto" },
  { value: "low", label: "Low (cheapest)" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export const getImageProvider = (value: string | undefined): ImageProvider | undefined =>
  IMAGE_PROVIDERS.find((provider) => provider.value === (value || "openai"));

export const resolveImageBaseUrl = (provider: ImageProvider, customBaseUrl: string): string | null => {
  const baseUrl = (provider.baseUrl || customBaseUrl).trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(baseUrl) ? baseUrl : null;
};

// DALL·E 3 knows only these, and calls its qualities standard and hd
const DALLE3_SIZES = new Set(["1024x1024", "1792x1024", "1024x1792"]);

/**
 * The JSON body for /images/generations. gpt-image models always answer
 * with base64 and reject response_format; DALL·E models need it, or they
 * answer with a link that expires.
 */
export const buildImageRequest = ({
  model,
  prompt,
  size,
  quality,
}: {
  model: string;
  prompt: string;
  size?: string;
  quality?: string;
}): Record<string, unknown> => {
  const chosenSize = size || "1024x1024";
  if (chosenSize !== "auto" && !/^\d{3,4}x\d{3,4}$/.test(chosenSize)) {
    throw new Error(`Size "${chosenSize}" must look like 1024x1024`);
  }

  const isDalle = /^dall-e/i.test(model);
  const isDalle3 = /^dall-e-3/i.test(model);
  const body: Record<string, unknown> = { model, prompt, n: 1 };

  if (isDalle3) {
    // "auto" and the gpt-image sizes do not exist there: the nearest one
    body.size = DALLE3_SIZES.has(chosenSize)
      ? chosenSize
      : chosenSize === "1536x1024"
        ? "1792x1024"
        : chosenSize === "1024x1536"
          ? "1024x1792"
          : "1024x1024";
  } else if (chosenSize !== "auto") {
    body.size = chosenSize;
  }

  if (quality && quality !== "auto") {
    body.quality = isDalle3 ? (quality === "high" ? "hd" : "standard") : quality;
  }
  if (isDalle) body.response_format = "b64_json";

  return body;
};

/** The first picture of an /images/generations answer, as base64 or a link. */
export const readImageResponse = (
  answer: unknown,
): { base64?: string; url?: string; revisedPrompt?: string } | null => {
  const first = (answer as { data?: unknown[] } | null)?.data?.[0] as
    | { b64_json?: unknown; url?: unknown; revised_prompt?: unknown }
    | undefined;
  if (!first) return null;
  const revisedPrompt = typeof first.revised_prompt === "string" ? first.revised_prompt : undefined;
  if (typeof first.b64_json === "string" && first.b64_json) return { base64: first.b64_json, revisedPrompt };
  if (typeof first.url === "string" && /^https:\/\//i.test(first.url)) return { url: first.url, revisedPrompt };
  return null;
};

/** PNG, JPEG or WebP from the first bytes; PNG when unknown. */
export const sniffImageType = (bytes: Uint8Array): { mimeType: string; extension: string } => {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return { mimeType: "image/jpeg", extension: "jpg" };
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57) {
    return { mimeType: "image/webp", extension: "webp" };
  }
  return { mimeType: "image/png", extension: "png" };
};
