import { fetch as undiciFetch, ProxyAgent } from "undici";
import type { NodeExecutor, WorkflowContext } from "@/features/executions/types";
import { callTelegram } from "@/lib/telegram";
import { safeFetch } from "@/lib/ssrf";
import {
  MAX_FILE_BYTES,
  saveWorkflowFile,
  type FileReference,
} from "@/lib/workflow-files";
import { loadCredentialSecret } from "../../lib/integration";
import { toTranscriptionFileName } from "../../lib/audio-options";

// Voice messages for the Telegram and WhatsApp triggers. A voice message
// arrives as an id, not as audio: the trigger downloads it, stores it as a
// workflow file and puts the file reference into the data
// ({{telegram.voice}}, {{whatsapp.voice}}), where a Transcribe Audio node
// can read it.
//
// A voice message that cannot be fetched never fails the run: the message
// still arrived. The reason is at {{telegram.voiceError}} /
// {{whatsapp.voiceError}}.

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const megabytes = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

const TOO_LARGE = `the voice message is larger than ${megabytes(MAX_FILE_BYTES)}, the limit for workflow files`;

type VoiceResult = { file: FileReference } | { error: string };

export type VoiceMedia = {
  fileId: string;
  mimeType: string;
  fileName: string;
  // Seconds, when the service says
  duration?: number;
};

/**
 * The voice message (or audio file) of a Telegram update, or null.
 */
export const findTelegramVoice = (update: unknown): VoiceMedia | null => {
  if (!isRecord(update)) return null;

  const message = [update.message, update.edited_message, update.channel_post].find(isRecord);
  if (!message) return null;

  const media = [message.voice, message.audio].find(isRecord);
  if (!media || typeof media.file_id !== "string" || !media.file_id) return null;

  const mimeType = typeof media.mime_type === "string" ? media.mime_type : "audio/ogg";

  return {
    fileId: media.file_id,
    mimeType,
    fileName: toTranscriptionFileName(
      typeof media.file_name === "string" ? media.file_name : "voice",
      mimeType
    ),
    ...(typeof media.duration === "number" ? { duration: media.duration } : {}),
  };
};

/**
 * The voice message (or audio file) of a WhatsApp message, or null.
 */
export const findWhatsappVoice = (message: unknown): VoiceMedia | null => {
  if (!isRecord(message) || !isRecord(message.audio)) return null;

  const { id, mime_type: type } = message.audio;
  if (typeof id !== "string" || !/^[\w-]{1,200}$/.test(id)) return null;

  const mimeType = typeof type === "string" ? type : "audio/ogg";

  return {
    fileId: id,
    mimeType,
    fileName: toTranscriptionFileName("voice", mimeType),
  };
};

const readBytes = async (response: { arrayBuffer: () => Promise<ArrayBuffer> }) => {
  const bytes = Buffer.from(await response.arrayBuffer());

  if (bytes.length > MAX_FILE_BYTES) throw new Error(TOO_LARGE);

  return bytes;
};

// The bot token is part of Telegram's addresses, so nothing a failed
// request says is passed on: only these messages are
const downloadTelegramFile = async (botToken: string, fileId: string): Promise<Buffer> => {
  let file: { file_path?: string; file_size?: number };

  try {
    file = await callTelegram(botToken, "getFile", { file_id: fileId });
  } catch {
    throw new Error("Telegram did not give the voice message (is the bot's credential still valid?)");
  }

  if (typeof file.file_size === "number" && file.file_size > MAX_FILE_BYTES) {
    throw new Error(TOO_LARGE);
  }

  if (!file.file_path || !/^[\w./-]+$/.test(file.file_path)) {
    throw new Error("Telegram did not give the voice message");
  }

  // Same optional proxy the Telegram node uses
  const dispatcher = process.env.TELEGRAM_PROXY
    ? new ProxyAgent(process.env.TELEGRAM_PROXY)
    : undefined;

  let response: Awaited<ReturnType<typeof undiciFetch>>;
  try {
    response = await undiciFetch(
      `https://api.telegram.org/file/bot${botToken}/${file.file_path}`,
      {
        signal: AbortSignal.timeout(60_000),
        ...(dispatcher && { dispatcher }),
      }
    );
  } catch {
    throw new Error("the voice message could not be downloaded from Telegram");
  }

  if (!response.ok) {
    throw new Error(`the voice message could not be downloaded from Telegram (HTTP ${response.status})`);
  }

  return readBytes(response);
};

const GRAPH_API_VERSION = "v21.0";

const downloadWhatsappMedia = async (accessToken: string, mediaId: string): Promise<Buffer> => {
  const headers = { Authorization: `Bearer ${accessToken}` };

  const lookup = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(mediaId)}`,
    { headers, signal: AbortSignal.timeout(20_000) }
  ).catch(() => null);

  if (!lookup?.ok) {
    throw new Error(
      `WhatsApp did not give the voice message${lookup ? ` (HTTP ${lookup.status})` : ""}. Check the WhatsApp credential on the trigger`
    );
  }

  const media = (await lookup.json().catch(() => ({}))) as {
    url?: unknown;
    file_size?: unknown;
  };

  if (typeof media.file_size === "number" && media.file_size > MAX_FILE_BYTES) {
    throw new Error(TOO_LARGE);
  }

  if (typeof media.url !== "string" || !/^https:\/\//i.test(media.url)) {
    throw new Error("WhatsApp did not give the voice message");
  }

  // The address comes from Meta's answer: it is still only fetched when
  // it is a public one
  const response = await safeFetch(media.url, {
    headers,
    signal: AbortSignal.timeout(60_000),
  }).catch(() => null);

  if (!response?.ok) {
    throw new Error("the voice message could not be downloaded from WhatsApp");
  }

  return readBytes(response);
};

type TriggerParams = Parameters<NodeExecutor>[0];

// Fetches the voice message in a step and stores it for the workflow's owner
const fetchVoice = async ({
  label,
  params,
  media,
  download,
}: {
  label: string;
  params: TriggerParams;
  media: VoiceMedia;
  download: (secret: string, fileId: string) => Promise<Buffer>;
}): Promise<VoiceResult> => {
  const { step, nodeId, userId, executionId, data, credential } = params;

  const credentialId =
    (typeof data.credentialId === "string" && data.credentialId) ||
    (typeof credential === "string" && credential) ||
    undefined;

  if (!credentialId) {
    return {
      error: `no credential is selected on the ${label}, so the voice message could not be downloaded`,
    };
  }

  let secret: string;
  try {
    secret = await loadCredentialSecret({
      step,
      stepId: `${nodeId}-get-voice-credential`,
      credentialId,
      userId,
      label,
    });
  } catch {
    return { error: `the credential of the ${label} could not be read` };
  }

  return step.run(`${nodeId}-download-voice`, async (): Promise<VoiceResult> => {
    try {
      const bytes = await download(secret, media.fileId);

      return {
        file: await saveWorkflowFile({
          label,
          userId,
          executionId,
          fileName: media.fileName,
          mimeType: media.mimeType.split(";")[0].trim() || "audio/ogg",
          data: bytes,
        }),
      };
    } catch (error) {
      return {
        // Only messages written above, or the file store's own
        error: error instanceof Error ? error.message : "the voice message could not be downloaded",
      };
    }
  });
};

const withVoice = (
  context: WorkflowContext,
  key: "telegram" | "whatsapp",
  result: VoiceResult,
  media: VoiceMedia
): WorkflowContext => ({
  ...context,
  [key]: {
    ...(context[key] as Record<string, unknown>),
    ...("file" in result
      ? {
          voice: {
            ...result.file,
            ...(media.duration !== undefined ? { duration: media.duration } : {}),
          },
        }
      : { voiceError: result.error }),
  },
});

/**
 * Telegram Trigger: the update is already in the data. A voice message (or
 * audio file) in it is downloaded with the trigger's bot credential and
 * added as {{telegram.voice}}.
 */
export const telegramTriggerExecutor: NodeExecutor = async (params) => {
  const media = findTelegramVoice(params.context.telegram);
  if (!media) return params.context;

  const result = await fetchVoice({
    label: "Telegram Trigger",
    params,
    media,
    download: downloadTelegramFile,
  });

  return withVoice(params.context, "telegram", result, media);
};

/**
 * WhatsApp Trigger: a voice message is downloaded with the WhatsApp
 * credential selected on the trigger (optional: without it the message
 * arrives as before, with {{whatsapp.voiceError}} saying why there is no
 * file) and added as {{whatsapp.voice}}.
 */
export const whatsappTriggerExecutor: NodeExecutor = async (params) => {
  const whatsapp = params.context.whatsapp;
  const media = isRecord(whatsapp) ? findWhatsappVoice(whatsapp.message) : null;
  if (!media) return params.context;

  const result = await fetchVoice({
    label: "WhatsApp Trigger",
    params,
    media,
    download: downloadWhatsappMedia,
  });

  return withVoice(params.context, "whatsapp", result, media);
};
