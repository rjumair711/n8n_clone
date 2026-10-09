import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "crypto";
import Cryptr from "cryptr";

// Stored credentials and OAuth tokens are encrypted with AES-256-GCM.
//
//   v1:<base64 of  IV (12 bytes) | auth tag (16 bytes) | ciphertext>
//
// The IV is random for every value. The 256-bit key is derived from
// ENCRYPTION_KEY with scrypt. ENCRYPTION_KEY_PREVIOUS, when set, is only
// used to read values written before the key was changed; see
// scripts/rotate-encryption-key.ts.
//
// Values without the "v1:" prefix are in the older format written by the
// cryptr package (hex; AES-256-GCM with a 16-byte IV and a per-value PBKDF2
// salt). They are still read, and the rotation script rewrites them as v1.

const VERSION_PREFIX = "v1:";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
// Fixed, so the same ENCRYPTION_KEY always gives the same AES key
const KEY_SALT = "rxj:credential-encryption:v1";

const derivedKeys = new Map<string, Buffer>();

const deriveKey = (secret: string): Buffer => {
  let key = derivedKeys.get(secret);

  if (!key) {
    key = scryptSync(secret, KEY_SALT, 32);
    derivedKeys.set(secret, key);
  }

  return key;
};

// Read on every call, not at import, so a script or test can set them first
const currentSecret = (): string => {
  const secret = process.env.ENCRYPTION_KEY;

  if (!secret) {
    throw new Error("ENCRYPTION_KEY is not set");
  }

  return secret;
};

const previousSecret = (): string | undefined =>
  process.env.ENCRYPTION_KEY_PREVIOUS || undefined;

/**
 * The secrets a stored value may have been written with: the current one
 * first, then the previous one while a key rotation is in progress.
 */
export const getEncryptionSecrets = (): string[] => {
  const current = currentSecret();
  const previous = previousSecret();

  return previous && previous !== current ? [current, previous] : [current];
};

const encryptWith = (secret: string, text: string): string => {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, deriveKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);

  return (
    VERSION_PREFIX +
    Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64")
  );
};

// Throws when the key is wrong or the value was changed (GCM's auth tag)
const decryptV1 = (secret: string, value: string): string => {
  const data = Buffer.from(value.slice(VERSION_PREFIX.length), "base64");

  if (data.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("value is too short");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    deriveKey(secret),
    data.subarray(0, IV_LENGTH),
    { authTagLength: TAG_LENGTH }
  );
  decipher.setAuthTag(data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH));

  return Buffer.concat([
    decipher.update(data.subarray(IV_LENGTH + TAG_LENGTH)),
    decipher.final(),
  ]).toString("utf8");
};

const decryptWith = (secret: string, value: string): string =>
  value.startsWith(VERSION_PREFIX)
    ? decryptV1(secret, value)
    : new Cryptr(secret).decrypt(value);

export const encrypt = (text: string): string =>
  encryptWith(currentSecret(), text);

export const decrypt = (value: string): string => {
  for (const secret of getEncryptionSecrets()) {
    try {
      return decryptWith(secret, value);
    } catch {
      // Not written with this key: try the next one
    }
  }

  // Says nothing about the value itself
  throw new Error(
    "Could not decrypt the stored value: it was written with a different ENCRYPTION_KEY, or it was changed"
  );
};

/**
 * True when the value is already in the current format and readable with
 * the current key, so a key rotation has nothing to do for it.
 */
export const isEncryptedWithCurrentKey = (value: string): boolean => {
  if (!value.startsWith(VERSION_PREFIX)) return false;

  try {
    decryptV1(currentSecret(), value);
    return true;
  } catch {
    return false;
  }
};

/**
 * The value encrypted again in the current format with the current key, or
 * null when it already is. Throws when no configured key can read it.
 */
export const reencrypt = (value: string): string | null =>
  isEncryptedWithCurrentKey(value) ? null : encrypt(decrypt(value));
