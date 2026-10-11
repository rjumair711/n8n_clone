// The providers and defaults of the Transcribe Audio and Text to Speech
// nodes. No server-only imports: the node dialogs use it too.
//
// Both nodes speak the OpenAI audio API (/audio/transcriptions and
// /audio/speech), which OpenAI, Groq and many other services and
// self-hosted servers offer.

export type AudioProvider = {
  value: string;
  label: string;
  // Empty for "custom", where the user types the URL
  baseUrl: string;
  // Used when the node's Model field is left empty; none means it must be set
  transcriptionModel: string;
  speechModel: string;
};

export const AUDIO_PROVIDERS: AudioProvider[] = [
  {
    value: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    transcriptionModel: "whisper-1",
    speechModel: "tts-1",
  },
  {
    value: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    transcriptionModel: "whisper-large-v3-turbo",
    speechModel: "",
  },
  {
    value: "custom",
    label: "OpenAI-compatible (custom base URL)",
    baseUrl: "",
    transcriptionModel: "",
    speechModel: "",
  },
];

export const getAudioProvider = (value: string | undefined) =>
  AUDIO_PROVIDERS.find((provider) => provider.value === (value || "openai"));

export const DEFAULT_VOICE = "alloy";

// What the speech is returned as, and the file it becomes
export const SPEECH_FORMATS = [
  { value: "mp3", label: "MP3", mimeType: "audio/mpeg", extension: "mp3" },
  { value: "opus", label: "Opus (voice messages)", mimeType: "audio/ogg", extension: "ogg" },
  { value: "wav", label: "WAV", mimeType: "audio/wav", extension: "wav" },
] as const;

export const getSpeechFormat = (value: string | undefined) =>
  SPEECH_FORMATS.find((format) => format.value === value) ?? SPEECH_FORMATS[0];

// The longest text one call may turn into speech (OpenAI's limit)
export const MAX_SPEECH_CHARACTERS = 4096;

/**
 * The base URL a node's settings point at, without a trailing slash, or
 * null when it is not usable (a custom provider without an http(s) URL).
 */
export const resolveAudioBaseUrl = (
  provider: AudioProvider,
  customBaseUrl: string
): string | null => {
  const baseUrl = (provider.baseUrl || customBaseUrl).trim().replace(/\/+$/, "");

  return /^https?:\/\//i.test(baseUrl) ? baseUrl : null;
};

// The file extensions the transcription APIs accept
const AUDIO_EXTENSIONS = new Set([
  "flac", "mp3", "mp4", "mpeg", "mpga", "m4a", "ogg", "wav", "webm",
]);

const MIME_EXTENSIONS: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/aac": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/webm": "webm",
  "audio/flac": "flac",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

/**
 * The name a file is sent to the transcription API under. The APIs decide
 * what a file is by its extension, so a Telegram voice note ("file_1.oga")
 * or a file without one gets the extension of its type.
 */
export const toTranscriptionFileName = (fileName: string, mimeType: string): string => {
  const base = fileName.replace(/[^\w.-]+/g, "_").replace(/^\.+/, "") || "audio";
  const extension = /\.([a-z0-9]+)$/i.exec(base)?.[1]?.toLowerCase();

  if (extension && AUDIO_EXTENSIONS.has(extension)) return base;

  const fromType =
    MIME_EXTENSIONS[mimeType.split(";")[0].trim().toLowerCase()] ??
    // .oga and .opus are Ogg files
    (extension === "oga" || extension === "opus" ? "ogg" : undefined);

  return fromType ? `${base.replace(/\.[a-z0-9]+$/i, "")}.${fromType}` : base;
};
