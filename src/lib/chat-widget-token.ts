import { createHmac } from "crypto";
import { secretsMatch } from "./webhook-security";

// The token a visitor's page asks for the bot's answer with. It is made for
// one run in one conversation (HMAC with the app's ENCRYPTION_KEY), so an
// execution id alone, or a token for another conversation, gets nothing.

const signingSecrets = (): string[] => {
  const current = process.env.ENCRYPTION_KEY;

  if (!current) {
    throw new Error("ENCRYPTION_KEY is not set");
  }

  const previous = process.env.ENCRYPTION_KEY_PREVIOUS;

  return previous && previous !== current ? [current, previous] : [current];
};

const sign = (secret: string, executionId: string, sessionKey: string) =>
  createHmac("sha256", secret)
    .update(`chat-reply:${executionId}:${sessionKey}`)
    .digest("base64url");

export const createChatReplyToken = (executionId: string, sessionKey: string) =>
  sign(signingSecrets()[0], executionId, sessionKey);

export const verifyChatReplyToken = (
  executionId: string,
  sessionKey: string,
  token: string | null | undefined
) => {
  if (!executionId || !sessionKey || !token) return false;

  let verified = false;
  for (const secret of signingSecrets()) {
    if (secretsMatch(token, sign(secret, executionId, sessionKey))) verified = true;
  }

  return verified;
};
