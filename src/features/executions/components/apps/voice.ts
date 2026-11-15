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

// Voice messages and images for the Telegram and WhatsApp triggers. Both
// arrive as an id, not as bytes: the trigger downloads the media, stores it
// as a workflow file and puts the file reference into the data
// ({{telegram.voice}} / {{whatsapp.voice}} for a Transcribe Audio node,
// {{telegram.image}} / {{whatsapp.image}} for Analyze Image or any file
// field). An image's caption stays at {{whatsapp.text}} / the update's
// caption.
//
// Media that cannot be fetched never fails the run: the message still
// arrived. The reason is at {{telegram.voiceError}} / {{whatsapp.imageError}}
// and so on.

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const megabytes = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

export type MediaKind = "voice" | "image";

const NOUN: Record<MediaKind, string> = { voice: "voice message", image: "image" };

const tooLarge = (what: string) =>
  `the ${what} is larger than ${megabytes(MAX_FILE_BYTES)}, the limit for workflow files`;

type MediaResult = { file: FileReference } | { error: string };

export type VoiceMedia = {
  kind?: MediaKind;
  fileId: string;
  mimeType: string;
  fileName: string;
  // Seconds, when the service says
  duration?: number;
  // Bytes, when the service says
  fileSize?: number;
};

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
};

/** "image.jpg" for image/jpeg, keeping a sensible name the sender gave. */
export const imageFileName = (mimeType: string, given?: string): string => {
  const type = mimeType.split(";")[0].trim().toLowerCase();
  const extension = IMAGE_EXTENSIONS[type] ?? "jpg";
  const base = (given ?? "").replace(/[^\w.-]+/g, "_").replace(/^[._]+/, "").slice(0, 100);
  if (base && /\.[a-z0-9]{2,5}$/i.test(base)) return base;
  return `${base || "image"}.${extension}`;
};

const telegramMessageOf = (update: unknown) =>
  isRecord(update)
    ? [update.message, update.edited_message, update.channel_post].find(isRecord)
    : undefined;

/**
 * The voice message (or audio file) of a Telegram update, or null.
 */
export const findTelegramVoice = (update: unknown): VoiceMedia | null => {
  const message = telegramMessageOf(update);
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
 * The image of a Telegram update, or null: a photo (Telegram sends several
 * sizes; the largest that fits the file limit is taken) or a picture sent
 * "as a file" (a document with an image type).
 */
export const findTelegramImage = (update: unknown): VoiceMedia | null => {
  const message = telegramMessageOf(update);
  if (!message) return null;

  if (Array.isArray(message.photo)) {
    const sizes = message.photo.filter(
      (size): size is Record<string, unknown> =>
        isRecord(size) && typeof size.file_id === "string" && !!size.file_id
    );
    const area = (size: Record<string, unknown>) =>
      (Number(size.width) || 0) * (Number(size.height) || 0);
    const fitting = sizes.filter(
      (size) => typeof size.file_size !== "number" || size.file_size <= MAX_FILE_BYTES
    );
    const best = [...(fitting.length ? fitting : sizes)].sort((a, b) => area(b) - area(a))[0];
    if (!best) return null;

    return {
      kind: "image",
      fileId: best.file_id as string,
      // Telegram re-encodes photos as JPEG
      mimeType: "image/jpeg",
      fileName: "photo.jpg",
      ...(typeof best.file_size === "number" ? { fileSize: best.file_size } : {}),
    };
  }

  const document = message.document;
  if (
    isRecord(document) &&
    typeof document.file_id === "string" &&
    document.file_id &&
    typeof document.mime_type === "string" &&
    document.mime_type.startsWith("image/")
  ) {
    return {
      kind: "image",
      fileId: document.file_id,
      mimeType: document.mime_type,
      fileName: imageFileName(
        document.mime_type,
        typeof document.file_name === "string" ? document.file_name : undefined
      ),
      ...(typeof document.file_size === "number" ? { fileSize: document.file_size } : {}),
    };
  }

  return null;
};

const whatsappMediaId = (value: unknown) =>
  typeof value === "string" && /^[\w-]{1,200}$/.test(value) ? value : null;

/**
 * The voice message (or audio file) of a WhatsApp message, or null.
 */
export const findWhatsappVoice = (message: unknown): VoiceMedia | null => {
  if (!isRecord(message) || !isRecord(message.audio)) return null;

  const { id, mime_type: type } = message.audio;
  const fileId = whatsappMediaId(id);
  if (!fileId) return null;

  const mimeType = typeof type === "string" ? type : "audio/ogg";

  return {
    fileId,
    mimeType,
    fileName: toTranscriptionFileName("voice", mimeType),
  };
};

/**
 * The image of a WhatsApp message, or null: an image message, or a
 * picture sent as a document.
 */
export const findWhatsappImage = (message: unknown): VoiceMedia | null => {
  if (!isRecord(message)) return null;

  if (isRecord(message.image)) {
    const fileId = whatsappMediaId(message.image.id);
    if (!fileId) return null;
    const mimeType =
      typeof message.image.mime_type === "string" ? message.image.mime_type : "image/jpeg";
    return { kind: "image", fileId, mimeType, fileName: imageFileName(mimeType) };
  }

  const document = message.document;
  if (
    isRecord(document) &&
    typeof document.mime_type === "string" &&
    document.mime_type.startsWith("image/")
  ) {
    const fileId = whatsappMediaId(document.id);
    if (!fileId) return null;
    return {
      kind: "image",
      fileId,
      mimeType: document.mime_type,
      fileName: imageFileName(
        document.mime_type,
        typeof document.filename === "string" ? document.filename : undefined
      ),
    };
  }

  return null;
};

const readBytes = async (
  response: { arrayBuffer: () => Promise<ArrayBuffer> },
  what: string
) => {
  const bytes = Buffer.from(await response.arrayBuffer());

  if (bytes.length > MAX_FILE_BYTES) throw new Error(tooLarge(what));

  return bytes;
};

// The bot token is part of Telegram's addresses, so nothing a failed
// request says is passed on: only these messages are
const downloadTelegramFile = async (botToken: string, fileId: string, what: string): Promise<Buffer> => {
  let file: { file_path?: string; file_size?: number };

  try {
    file = await callTelegram(botToken, "getFile", { file_id: fileId });
  } catch {
    throw new Error(`Telegram did not give the ${what} (is the bot's credential still valid?)`);
  }

  if (typeof file.file_size === "number" && file.file_size > MAX_FILE_BYTES) {
    throw new Error(tooLarge(what));
  }

  if (!file.file_path || !/^[\w./-]+$/.test(file.file_path)) {
    throw new Error(`Telegram did not give the ${what}`);
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
    throw new Error(`the ${what} could not be downloaded from Telegram`);
  }

  if (!response.ok) {
    throw new Error(`the ${what} could not be downloaded from Telegram (HTTP ${response.status})`);
  }

  return readBytes(response, what);
};

const GRAPH_API_VERSION = "v21.0";

const downloadWhatsappMedia = async (accessToken: string, mediaId: string, what: string): Promise<Buffer> => {
  const headers = { Authorization: `Bearer ${accessToken}` };

  const lookup = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(mediaId)}`,
    { headers, signal: AbortSignal.timeout(20_000) }
  ).catch(() => null);

  if (!lookup?.ok) {
    throw new Error(
      `WhatsApp did not give the ${what}${lookup ? ` (HTTP ${lookup.status})` : ""}. Check the WhatsApp credential on the trigger`
    );
  }

  const media = (await lookup.json().catch(() => ({}))) as {
    url?: unknown;
    file_size?: unknown;
  };

  if (typeof media.file_size === "number" && media.file_size > MAX_FILE_BYTES) {
    throw new Error(tooLarge(what));
  }

  if (typeof media.url !== "string" || !/^https:\/\//i.test(media.url)) {
    throw new Error(`WhatsApp did not give the ${what}`);
  }

  // The address comes from Meta's answer: it is still only fetched when
  // it is a public one
  const response = await safeFetch(media.url, {
    headers,
    signal: AbortSignal.timeout(60_000),
  }).catch(() => null);

  if (!response?.ok) {
    throw new Error(`the ${what} could not be downloaded from WhatsApp`);
  }

  return readBytes(response, what);
};

type TriggerParams = Parameters<NodeExecutor>[0];

// Fetches the media in a step and stores it for the workflow's owner. The
// voice steps keep the ids they had before images were added
const fetchMedia = async ({
  label,
  params,
  media,
  download,
}: {
  label: string;
  params: TriggerParams;
  media: VoiceMedia;
  download: (secret: string, fileId: string, what: string) => Promise<Buffer>;
}): Promise<MediaResult> => {
  const { step, nodeId, userId, executionId, data, credential } = params;
  const kind = media.kind ?? "voice";
  const what = NOUN[kind];

  const credentialId =
    (typeof data.credentialId === "string" && data.credentialId) ||
    (typeof credential === "string" && credential) ||
    undefined;

  if (!credentialId) {
    return {
      error: `no credential is selected on the ${label}, so the ${what} could not be downloaded`,
    };
  }

  if (media.fileSize !== undefined && media.fileSize > MAX_FILE_BYTES) {
    return { error: tooLarge(what) };
  }

  let secret: string;
  try {
    secret = await loadCredentialSecret({
      step,
      stepId: `${nodeId}-get-${kind}-credential`,
      credentialId,
      userId,
      label,
    });
  } catch {
    return { error: `the credential of the ${label} could not be read` };
  }

  return step.run(`${nodeId}-download-${kind}`, async (): Promise<MediaResult> => {
    try {
      const bytes = await download(secret, media.fileId, what);

      return {
        file: await saveWorkflowFile({
          label,
          userId,
          executionId,
          fileName: media.fileName,
          mimeType:
            media.mimeType.split(";")[0].trim() ||
            (kind === "image" ? "image/jpeg" : "audio/ogg"),
          data: bytes,
        }),
      };
    } catch (error) {
      return {
        // Only messages written above, or the file store's own
        error: error instanceof Error ? error.message : `the ${what} could not be downloaded`,
      };
    }
  });
};

const withMedia = (
  context: WorkflowContext,
  key: "telegram" | "whatsapp",
  result: MediaResult,
  media: VoiceMedia
): WorkflowContext => {
  const kind = media.kind ?? "voice";
  return {
    ...context,
    [key]: {
      ...(context[key] as Record<string, unknown>),
      ...("file" in result
        ? {
            [kind]: {
              ...result.file,
              ...(media.duration !== undefined ? { duration: media.duration } : {}),
            },
          }
        : { [`${kind}Error`]: result.error }),
    },
  };
};

/**
 * Telegram Trigger: the update is already in the data. A voice message (or
 * audio file) or an image in it is downloaded with the trigger's bot
 * credential and added as {{telegram.voice}} / {{telegram.image}}.
 */
export const telegramTriggerExecutor: NodeExecutor = async (params) => {
  const media = findTelegramVoice(params.context.telegram) ?? findTelegramImage(params.context.telegram);
  if (!media) return params.context;

  const result = await fetchMedia({
    label: "Telegram Trigger",
    params,
    media,
    download: downloadTelegramFile,
  });

  return withMedia(params.context, "telegram", result, media);
};

/**
 * WhatsApp Trigger: a voice message or an image is downloaded with the
 * WhatsApp credential selected on the trigger (optional: without it the
 * message arrives as before, with {{whatsapp.voiceError}} /
 * {{whatsapp.imageError}} saying why there is no file) and added as
 * {{whatsapp.voice}} / {{whatsapp.image}}.
 */
export const whatsappTriggerExecutor: NodeExecutor = async (params) => {
  const whatsapp = params.context.whatsapp;
  const message = isRecord(whatsapp) ? whatsapp.message : null;
  const media = findWhatsappVoice(message) ?? findWhatsappImage(message);
  if (!media) return params.context;

  const result = await fetchMedia({
    label: "WhatsApp Trigger",
    params,
    media,
    download: downloadWhatsappMedia,
  });

  return withMedia(params.context, "whatsapp", result, media);
};
