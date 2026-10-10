import "server-only";

import { createHmac } from "crypto";
import { NodeType } from "@prisma/client";
import { fetch, ProxyAgent } from "undici";
import prisma from "./db";
import { decrypt } from "./encryption";
import { getAppUrl } from "./app-url";

type TelegramResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

export const callTelegram = async <T = unknown>(
  botToken: string,
  method: string,
  payload: Record<string, unknown>
): Promise<T> => {
  // Same optional proxy the Telegram node uses
  const dispatcher = process.env.TELEGRAM_PROXY
    ? new ProxyAgent(process.env.TELEGRAM_PROXY)
    : undefined;

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
      ...(dispatcher && { dispatcher }),
    }
  );

  const data = (await response.json()) as TelegramResponse<T>;

  if (!response.ok || !data.ok) {
    throw new Error(data.description || `HTTP ${response.status}`);
  }

  return data.result as T;
};

export const getTelegramWebhookUrl = (workflowId: string) =>
  `${getAppUrl()}/api/webhooks/telegram/${workflowId}`;

/**
 * Telegram sends this back in the X-Telegram-Bot-Api-Secret-Token header of
 * every update, which proves the request comes from Telegram. Derived from
 * the app's key, so nothing has to be stored on the node.
 */
const deriveTelegramWebhookSecret = (key: string, workflowId: string) =>
  createHmac("sha256", key)
    .update(`telegram-webhook:${workflowId}`)
    .digest("hex");

// Without the key the secret could be worked out from the workflow id, so
// there is none: no webhook is registered and no update is accepted
const requireKey = () => {
  const key = process.env.ENCRYPTION_KEY?.trim();

  if (!key) {
    throw new Error(
      "ENCRYPTION_KEY is not set, so the Telegram webhook cannot be secured"
    );
  }

  return key;
};

export const getTelegramWebhookSecret = (workflowId: string) =>
  deriveTelegramWebhookSecret(requireKey(), workflowId);

/**
 * The secrets to accept from Telegram: the current one, and while
 * ENCRYPTION_KEY_PREVIOUS is set also the one from before the key was
 * changed. A webhook registered with the old key keeps working until the
 * workflow is activated again, which registers it with the new one.
 */
export const getAcceptedTelegramWebhookSecrets = (workflowId: string) => {
  const current = process.env.ENCRYPTION_KEY?.trim();
  const previous = process.env.ENCRYPTION_KEY_PREVIOUS;

  return [
    // No key, no accepted secret: every update is refused
    ...(current ? [deriveTelegramWebhookSecret(current, workflowId)] : []),
    ...(previous ? [deriveTelegramWebhookSecret(previous, workflowId)] : []),
  ];
};

/**
 * Points the bots of a workflow's Telegram Trigger nodes at this app when
 * the workflow is activated, and removes the webhook when it is deactivated
 * (n8n does the same on activation). Returns a message when it failed.
 */
export const syncTelegramWebhooks = async ({
  workflowId,
  userId,
  active,
}: {
  workflowId: string;
  userId: string;
  active: boolean;
}): Promise<string | null> => {
  const triggerNodes = await prisma.node.findMany({
    where: { workflowId, type: NodeType.TELEGRAM_TRIGGER },
  });

  for (const node of triggerNodes) {
    const credentialId = (node.data as { credentialId?: string } | null)
      ?.credentialId;

    if (!credentialId) {
      if (active) return "The Telegram Trigger has no bot credential selected.";
      continue;
    }

    const credential = await prisma.credential.findUnique({
      where: { id: credentialId, userId },
    });

    if (!credential) {
      if (active) return "The Telegram Trigger's credential was not found.";
      continue;
    }

    try {
      const botToken = decrypt(credential.value).trim();

      if (active) {
        await callTelegram(botToken, "setWebhook", {
          url: getTelegramWebhookUrl(workflowId),
          secret_token: getTelegramWebhookSecret(workflowId),
          allowed_updates: ["message", "edited_message", "callback_query"],
        });
      } else {
        await callTelegram(botToken, "deleteWebhook", {});
      }
    } catch (error) {
      // Deactivating must always work, even when Telegram is unreachable
      if (!active) continue;

      const detail = error instanceof Error ? error.message : "unknown error";

      return `Telegram did not accept the webhook (${detail}). Telegram needs a public https address: check NEXT_PUBLIC_APP_URL.`;
    }
  }

  return null;
};
