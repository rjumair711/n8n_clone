import { NonRetriableError } from "inngest";
import type { NodeExecutor } from "@/features/executions/types";
import { BlockedRequestError, safeFetch } from "@/lib/ssrf";
import { MAX_FILE_BYTES, saveWorkflowFile } from "@/lib/workflow-files";
import { renderTemplate } from "../../lib/templates";
import { loadCredentialSecret } from "../../lib/integration";
import {
  IMAGE_PROMPT_MAX,
  buildImageRequest,
  getImageProvider,
  readImageResponse,
  resolveImageBaseUrl,
  sniffImageType,
} from "../../lib/image-options";

// Image Generation: the OpenAI images API (/images/generations) at OpenAI
// or any server that offers the same endpoint. The picture is stored as a
// workflow file, so the Instagram / Facebook Post, WhatsApp, Telegram and
// email nodes can send it.

type ImageData = {
  variableName?: string;
  credentialId?: string;
  // The provider: "openai" (default) | "custom"
  operation?: string;
  [key: string]: string | undefined;
};

const IMAGE_TIMEOUT_MS = 180_000;
const label = "Image Generation";

const readApiError = async (response: Response): Promise<string> => {
  const body = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown } | string };
    const message = typeof parsed.error === "object" ? parsed.error?.message : parsed.error;
    if (typeof message === "string" && message.trim()) return message.trim().slice(0, 500);
  } catch {
    // Not JSON
  }
  return `HTTP ${response.status}`;
};

const tooLarge = () =>
  new NonRetriableError(
    `${label} node: the image is larger than ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB, the limit for workflow files. Ask for a smaller size.`
  );

/** One call to /images/generations: the picture's bytes and what the API said. */
export const requestImage = async ({
  baseUrl,
  apiKey,
  body,
}: {
  baseUrl: string;
  apiKey: string;
  body: Record<string, unknown>;
}): Promise<{ bytes: Buffer; revisedPrompt?: string }> => {
  const response = await safeFetch(`${baseUrl}/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new NonRetriableError(`${label} node failed: ${await readApiError(response)}`);
  }

  const answer = readImageResponse(await response.json().catch(() => null));
  if (!answer) throw new NonRetriableError(`${label} node: the API returned no image`);

  if (answer.base64) {
    const bytes = Buffer.from(answer.base64, "base64");
    if (bytes.length > MAX_FILE_BYTES) throw tooLarge();
    return { bytes, revisedPrompt: answer.revisedPrompt };
  }

  // Some servers answer with a link instead: still only a public address
  const download = await safeFetch(answer.url!, { signal: AbortSignal.timeout(60_000) });
  if (!download.ok) throw new NonRetriableError(`${label} node: the image could not be downloaded (HTTP ${download.status})`);
  const bytes = Buffer.from(await download.arrayBuffer());
  if (bytes.length > MAX_FILE_BYTES) throw tooLarge();
  return { bytes, revisedPrompt: answer.revisedPrompt };
};

export const imageGenerationExecutor: NodeExecutor<ImageData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
  executionId,
}) => {
  const variableName = data.variableName?.trim() || "image";

  const provider = getImageProvider(data.operation);
  if (!provider) throw new NonRetriableError(`${label} node: Unsupported provider "${data.operation}"`);

  const prompt = renderTemplate(data.prompt, context).trim();
  if (!prompt) throw new NonRetriableError(`${label} node: Prompt is required`);
  if (prompt.length > IMAGE_PROMPT_MAX) {
    throw new NonRetriableError(`${label} node: the prompt has ${prompt.length} characters; at most ${IMAGE_PROMPT_MAX}`);
  }

  const baseUrl = resolveImageBaseUrl(provider, renderTemplate(data.baseUrl, context));
  if (!baseUrl) {
    throw new NonRetriableError(`${label} node: Base URL must be the API's http(s) address, for example https://api.example.com/v1`);
  }

  const model = renderTemplate(data.model, context).trim() || provider.model;
  if (!model) throw new NonRetriableError(`${label} node: Model is required for ${provider.label}`);

  let body: Record<string, unknown>;
  try {
    body = buildImageRequest({
      model,
      prompt,
      size: renderTemplate(data.size, context).trim(),
      quality: renderTemplate(data.quality, context).trim(),
    });
  } catch (error) {
    throw new NonRetriableError(`${label} node: ${error instanceof Error ? error.message : "invalid settings"}`);
  }

  const apiKey = await loadCredentialSecret({
    step,
    stepId: `${nodeId}-get-image-credential`,
    credentialId: data.credentialId,
    userId,
    label,
  });

  try {
    const result = await step.run(`image-generation-${nodeId}`, async () => {
      const { bytes, revisedPrompt } = await requestImage({ baseUrl, apiKey, body });
      const type = sniffImageType(bytes);
      const baseName = renderTemplate(data.fileName, context).trim().replace(/\.[a-z0-9]+$/i, "") || "image";

      const file = await saveWorkflowFile({
        label,
        userId,
        executionId,
        fileName: `${baseName}.${type.extension}`,
        mimeType: type.mimeType,
        data: bytes,
      });
      return { file, ...(revisedPrompt ? { revisedPrompt } : {}) };
    });

    return {
      ...context,
      [variableName]: { ...result, model, provider: provider.value, prompt },
    };
  } catch (error) {
    if (error instanceof NonRetriableError) throw error;
    if (error instanceof BlockedRequestError) throw new NonRetriableError(`${label} node: ${error.message}`);
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new NonRetriableError(
      `${label} node failed: ${timedOut ? "the API took too long to answer" : error instanceof Error ? error.message : "unknown error"}`
    );
  }
};
