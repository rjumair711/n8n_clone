import { NonRetriableError } from "inngest";
import { FormData } from "undici";
import type { NodeExecutor } from "@/features/executions/types";
import { BlockedRequestError, safeFetch } from "@/lib/ssrf";
import { MAX_FILE_BYTES, saveWorkflowFile } from "@/lib/workflow-files";
import { renderTemplate } from "../../lib/templates";
import { loadCredentialSecret } from "../../lib/integration";
import { loadFiles, resolveFileId } from "../files/executors";
import {
  DEFAULT_VOICE,
  MAX_SPEECH_CHARACTERS,
  getAudioProvider,
  getSpeechFormat,
  resolveAudioBaseUrl,
  toTranscriptionFileName,
} from "../../lib/audio-options";

// Transcribe Audio and Text to Speech: the OpenAI audio API, at OpenAI,
// Groq or any server that offers the same endpoints.

type AudioData = {
  variableName?: string;
  credentialId?: string;
  // The provider: "openai" (default) | "groq" | "custom"
  operation?: string;
  [key: string]: string | undefined;
};

const TRANSCRIBE_TIMEOUT_MS = 120_000;
const SPEECH_TIMEOUT_MS = 120_000;

// What the API said went wrong, without anything else of its answer
const readApiError = async (response: Response): Promise<string> => {
  const body = await response.text().catch(() => "");

  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown } | string; message?: unknown };
    const message =
      (typeof parsed.error === "object" ? parsed.error?.message : parsed.error) ??
      parsed.message;

    if (typeof message === "string" && message.trim()) return message.trim().slice(0, 500);
  } catch {
    // Not JSON
  }

  return `HTTP ${response.status}`;
};

// The settings both nodes share: where to send the request and with what
const resolveEndpoint = async ({
  label,
  kind,
  data,
  context,
  nodeId,
  userId,
  step,
}: {
  label: string;
  kind: "transcriptionModel" | "speechModel";
  data: AudioData;
  context: Record<string, unknown>;
  nodeId: string;
  userId: string;
  step: Parameters<NodeExecutor>[0]["step"];
}) => {
  const provider = getAudioProvider(data.operation);

  if (!provider) {
    throw new NonRetriableError(`${label} node: Unsupported provider "${data.operation}"`);
  }

  const baseUrl = resolveAudioBaseUrl(provider, renderTemplate(data.baseUrl, context));

  if (!baseUrl) {
    throw new NonRetriableError(
      `${label} node: Base URL must be the API's http(s) address, for example https://api.example.com/v1`
    );
  }

  const model = renderTemplate(data.model, context).trim() || provider[kind];

  if (!model) {
    throw new NonRetriableError(`${label} node: Model is required for ${provider.label}`);
  }

  const apiKey = await loadCredentialSecret({
    step,
    stepId: `${nodeId}-get-audio-credential`,
    credentialId: data.credentialId,
    userId,
    label,
  });

  return { provider, baseUrl, model, apiKey };
};

const toAudioError = (label: string, error: unknown) => {
  if (error instanceof NonRetriableError) return error;

  if (error instanceof BlockedRequestError) {
    return new NonRetriableError(`${label} node: ${error.message}`);
  }

  const timedOut = error instanceof Error && error.name === "TimeoutError";

  return new NonRetriableError(
    `${label} node failed: ${
      timedOut
        ? "the API took too long to answer"
        : error instanceof Error
          ? error.message
          : "unknown error"
    }`
  );
};

// =========================================================================
// TRANSCRIBE AUDIO
// =========================================================================
/**
 * One call to an /audio/transcriptions endpoint. The request goes through
 * the SSRF guard: a custom base URL is typed in by the user.
 */
export const requestTranscription = async ({
  baseUrl,
  apiKey,
  model,
  file,
  language,
  prompt,
}: {
  baseUrl: string;
  apiKey: string;
  model: string;
  file: { fileName: string; mimeType: string; data: Uint8Array };
  language?: string;
  prompt?: string;
}) => {
  const label = "Transcribe Audio";

  const form = new FormData();
  form.set(
    "file",
    new Blob([new Uint8Array(file.data)], { type: file.mimeType }),
    toTranscriptionFileName(file.fileName, file.mimeType)
  );
  form.set("model", model);
  form.set("response_format", "json");
  if (language) form.set("language", language);
  if (prompt) form.set("prompt", prompt);

  const response = await safeFetch(`${baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form as unknown as BodyInit,
    signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new NonRetriableError(`${label} node failed: ${await readApiError(response)}`);
  }

  const body = (await response.json().catch(() => null)) as {
    text?: unknown;
    language?: unknown;
    duration?: unknown;
  } | null;

  if (typeof body?.text !== "string") {
    throw new NonRetriableError(
      `${label} node: the API did not answer with a transcription`
    );
  }

  return {
    text: body.text.trim(),
    ...(typeof body.language === "string" ? { language: body.language } : {}),
    ...(typeof body.duration === "number" ? { duration: body.duration } : {}),
  };
};

/**
 * Turns speech in an audio file into text with OpenAI Whisper, Groq
 * Whisper or any OpenAI-compatible /audio/transcriptions endpoint.
 */
export const transcribeAudioExecutor: NodeExecutor<AudioData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
  items,
}) => {
  const label = "Transcribe Audio";
  const variableName = data.variableName?.trim() || "transcript";

  // Before any step runs, so a wrong variable fails early
  const fileId = resolveFileId(label, context, data.file, items);

  const language = renderTemplate(data.language, context).trim().toLowerCase();
  if (language && !/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(language)) {
    throw new NonRetriableError(
      `${label} node: Language must be a language code such as en, ur or ar`
    );
  }

  const prompt = renderTemplate(data.prompt, context).trim().slice(0, 1000);

  const { provider, baseUrl, model, apiKey } = await resolveEndpoint({
    label,
    kind: "transcriptionModel",
    data,
    context,
    nodeId,
    userId,
    step,
  });

  try {
    const result = await step.run(`transcribe-audio-${nodeId}`, async () => {
      const [file] = await loadFiles(label, [fileId], userId);

      return {
        ...(await requestTranscription({ baseUrl, apiKey, model, file, language, prompt })),
        fileName: file.fileName,
      };
    });

    return {
      ...context,
      [variableName]: { ...result, model, provider: provider.value },
    };
  } catch (error) {
    throw toAudioError(label, error);
  }
};

// =========================================================================
// TEXT TO SPEECH
// =========================================================================
/**
 * Reads the bytes of a response up to a size, so the audio a server sends
 * cannot be larger than a workflow file may be.
 */
const readAudio = async (response: Response, label: string): Promise<Buffer> => {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.from(await response.arrayBuffer());

  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      size += value.length;
      if (size > MAX_FILE_BYTES) {
        throw new NonRetriableError(
          `${label} node: the audio is larger than ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB, the limit for workflow files. Use a shorter text.`
        );
      }

      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  return Buffer.concat(chunks);
};

/**
 * One call to an /audio/speech endpoint: the audio's bytes, at most as
 * many as a workflow file may have.
 */
export const requestSpeech = async ({
  baseUrl,
  apiKey,
  model,
  input,
  voice,
  format,
}: {
  baseUrl: string;
  apiKey: string;
  model: string;
  input: string;
  voice: string;
  format: string;
}): Promise<Buffer> => {
  const label = "Text to Speech";

  const response = await safeFetch(`${baseUrl}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input, voice, response_format: format }),
    signal: AbortSignal.timeout(SPEECH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new NonRetriableError(`${label} node failed: ${await readApiError(response)}`);
  }

  const audio = await readAudio(response, label);

  if (audio.length === 0) {
    throw new NonRetriableError(`${label} node: the API returned no audio`);
  }

  return audio;
};

/**
 * Turns text into speech with OpenAI TTS or an OpenAI-compatible
 * /audio/speech endpoint. The audio is stored as a workflow file: the
 * result is a file reference other nodes can send or attach.
 */
export const textToSpeechExecutor: NodeExecutor<AudioData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
  executionId,
}) => {
  const label = "Text to Speech";
  const variableName = data.variableName?.trim() || "speech";

  const input = renderTemplate(data.text, context).trim();
  if (!input) {
    throw new NonRetriableError(`${label} node: Text is required`);
  }

  if (input.length > MAX_SPEECH_CHARACTERS) {
    throw new NonRetriableError(
      `${label} node: the text has ${input.length} characters; one call can speak at most ${MAX_SPEECH_CHARACTERS}. Shorten it, or split it over several nodes.`
    );
  }

  const voice = renderTemplate(data.voice, context).trim() || DEFAULT_VOICE;
  const format = getSpeechFormat(data.format);

  const { provider, baseUrl, model, apiKey } = await resolveEndpoint({
    label,
    kind: "speechModel",
    data,
    context,
    nodeId,
    userId,
    step,
  });

  try {
    const file = await step.run(`text-to-speech-${nodeId}`, async () => {
      const audio = await requestSpeech({
        baseUrl,
        apiKey,
        model,
        input,
        voice,
        format: format.value,
      });

      // Stored like every other workflow file: same size limit, same
      // storage quota, removed after the retention period
      return saveWorkflowFile({
        label,
        userId,
        executionId,
        fileName: `${renderTemplate(data.fileName, context).trim().replace(/\.[a-z0-9]+$/i, "") || "speech"}.${format.extension}`,
        mimeType: format.mimeType,
        data: audio,
      });
    });

    return {
      ...context,
      [variableName]: {
        file,
        characters: input.length,
        voice,
        model,
        provider: provider.value,
      },
    };
  } catch (error) {
    throw toAudioError(label, error);
  }
};
