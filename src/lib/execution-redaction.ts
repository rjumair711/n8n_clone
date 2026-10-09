import { createHash } from "crypto";
import { decrypt } from "./encryption";
import {
  collectCredentialSecrets,
  redactString,
  redactValue,
} from "./redaction";

// The workflow function is re-run from the top after every step, so the
// same credentials would be decrypted again and again during one run. Kept
// in memory only, for the latest runs.
const SECRETS_CACHE_SIZE = 50;
const secretsCache = new Map<string, string[]>();

const getSecrets = (encryptedValues: readonly string[]): string[] => {
  if (encryptedValues.length === 0) return [];

  const cacheKey = createHash("sha256")
    .update(encryptedValues.join("\n"))
    .digest("hex");

  const cached = secretsCache.get(cacheKey);
  if (cached) return cached;

  const plainValues: string[] = [];

  for (const value of encryptedValues) {
    try {
      plainValues.push(decrypt(value));
    } catch {
      // A credential that cannot be read cannot be used by the run either
    }
  }

  const secrets = collectCredentialSecrets(plainValues);

  if (secretsCache.size >= SECRETS_CACHE_SIZE) {
    const oldest = secretsCache.keys().next().value;
    if (oldest !== undefined) secretsCache.delete(oldest);
  }
  secretsCache.set(cacheKey, secrets);

  return secrets;
};

export type RunRedactor = {
  // For node input and output: credential values and the well-known secret
  // shapes are replaced
  data: <T>(value: T) => T;
  // For error messages and stacks: the same
  text: <T extends string | undefined>(value: T) => T;
  // For the run's final output, which is also what "respond when finished"
  // webhooks and the chat panel send back: credential values only, so a
  // workflow that returns a token it made itself still works
  result: <T>(value: T) => T;
};

/**
 * Redacts what is about to be stored about a run. Takes the encrypted
 * values of the credentials the run may use; the plain values never leave
 * this module.
 */
export const createRunRedactor = (
  encryptedCredentialValues: readonly string[] = []
): RunRedactor => {
  const secrets = getSecrets(encryptedCredentialValues);

  return {
    data: (value) => redactValue(value, { secrets }),
    text: (value) =>
      (typeof value === "string" ? redactString(value, { secrets }) : value) as typeof value,
    result: (value) => redactValue(value, { secrets, patterns: false }),
  };
};
