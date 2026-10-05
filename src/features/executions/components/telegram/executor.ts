import type { NodeExecutor } from "@/features/executions/types";
import { renderEscapedTemplate } from "@/features/executions/lib/templates";
import { NonRetriableError } from "inngest";
import Handlebars from "handlebars";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { fetch, FormData, ProxyAgent } from "undici";
import { loadFiles, resolveFileId } from "../files/executors";

type TelegramData = {
  variableName?: string;
  credentialId?: string;
  chatId?: string;
  text?: string;
  parseMode?: "HTML" | "MarkdownV2" | "None";
  // A file variable (e.g. "pdf.file"): the message is sent as a document
  // with the text as its caption
  file?: string;
};

// Telegram's limit for a caption; a longer text is cut
const MAX_CAPTION_LENGTH = 1024;

// ✅ Fix 1: Explicit response shape — kills all 'unknown' TS errors
type TelegramAPIResponse = {
  ok: boolean;
  result?: {
    message_id: number;
    chat: Record<string, unknown>;
    date: number;
  };
  description?: string;
};

export const telegramExecutor: NodeExecutor<TelegramData> = async ({
  data,
  userId,
  context,
  step,
}) => {
  if (!data.variableName) throw new NonRetriableError("Telegram node: Variable name context parameter is missing");
  if (!data.credentialId) throw new NonRetriableError("Telegram node: Authentication credential reference missing");
  if (!data.chatId) throw new NonRetriableError("Telegram node: Target destination Chat ID identifier required");
  if (!data.text) throw new NonRetriableError("Telegram node: Dispatched target string text structural body required");

  const targetChatId = renderEscapedTemplate(data.chatId, context);
  const messageText = renderEscapedTemplate(data.text, context);
  const documentId = data.file?.trim()
    ? resolveFileId("Telegram", context, data.file)
    : null;

  const credential = await step.run("get-telegram-credential", async () => {
    return prisma.credential.findUnique({
      where: { id: data.credentialId, userId },
    });
  });

  if (!credential) {
    throw new NonRetriableError("Telegram node: Credential not found");
  }

  try {
    const botToken = decrypt(credential.value).trim();

    // ✅ Fix 2: Typed step.run so 'result' is not unknown
    const result = await step.run("telegram-send-message", async (): Promise<TelegramAPIResponse> => {
      const payload: Record<string, unknown> = {
        chat_id: targetChatId,
        text: messageText,
      };

      if (data.parseMode && data.parseMode !== "None") {
        payload.parse_mode = data.parseMode;
      }

      // ✅ Fix 3: Only use ProxyAgent if HTTPS_PROXY is set (safe for Vercel too)
      const dispatcher = process.env.TELEGRAM_PROXY
        ? new ProxyAgent(process.env.TELEGRAM_PROXY)
        : undefined;

      try {
        let response: Awaited<ReturnType<typeof fetch>>;

        if (documentId) {
          const [file] = await loadFiles("Telegram", [documentId], userId);

          const form = new FormData();
          form.set("chat_id", targetChatId);
          form.set("caption", messageText.slice(0, MAX_CAPTION_LENGTH));
          if (payload.parse_mode) form.set("parse_mode", String(payload.parse_mode));
          form.set(
            "document",
            new Blob([new Uint8Array(file.data)], { type: file.mimeType }),
            file.fileName
          );

          response = await fetch(
            `https://api.telegram.org/bot${botToken}/sendDocument`,
            {
              method: "POST",
              body: form,
              // Uploads take longer than a text message
              signal: AbortSignal.timeout(60_000),
              ...(dispatcher && { dispatcher }),
            }
          );
        } else {
          response = await fetch(
            `https://api.telegram.org/bot${botToken}/sendMessage`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
              signal: AbortSignal.timeout(10_000),
              ...(dispatcher && { dispatcher }),
            }
          );
        }

        // ✅ Fix 4: Cast json() to our known type
        const responseData = await response.json() as TelegramAPIResponse;

        if (!response.ok || !responseData.ok) {
          throw new Error(responseData.description || `HTTP ${response.status}`);
        }

        return responseData;

      } catch (networkError: any) {
        const cause = networkError.cause as any;
        console.error("Telegram fetch failed:", {
          code: cause?.code,
          errno: cause?.errno,
          message: networkError.message,
        });
        throw new Error(`Network failure connecting to Telegram: ${networkError.message}`);
      }
    });

    return {
      ...context,
      [data.variableName]: {
        ok: result.ok,
        messageId: result.result?.message_id,
        chat: result.result?.chat,
        date: result.result?.date,
      },
    };

  } catch (error: any) {
    throw new NonRetriableError(`Telegram integration tracking pipeline runtime execution crash: ${error.message}`);
  }
};