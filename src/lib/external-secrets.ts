import "server-only";

import { NonRetriableError } from "inngest";
import { signAwsJsonRequest } from "./aws-sigv4";
import prisma from "./db";
import { decrypt } from "./encryption";
import {
  hasSecretRefs,
  isSecretName,
  parseSecretRefs,
  pickSecretValue,
  readAwsConfig,
  readVaultConfig,
  substituteSecrets,
  vaultSecretUrl,
  type SecretRef,
} from "./secret-refs";
import { safeFetch } from "./ssrf";

// External secrets: a credential of a workspace may hold
// {{$secrets.<store>.<secret>#<field>}} instead of the secret itself. The
// value is read from the workspace's HashiCorp Vault or AWS Secrets Manager
// when the credential is used, and is never written to the database.

const REQUEST_TIMEOUT_MS = 10_000;

// How long a secret that was read is used before it is read again, in this
// server process. A rotated secret is picked up after at most this long.
const CACHE_SECONDS = Math.max(Number(process.env.EXTERNAL_SECRETS_CACHE_SECONDS) || 300, 0);

type StoreRow = { id: string; name: string; type: string; config: string; updatedAt: Date };

const cache = new Map<string, { payload: unknown; expiresAt: number }>();

// Every value this process has read from a store, so that what is stored
// about a run can be cleaned of them (see execution-redaction.ts)
const resolvedValues = new Set<string>();
const MAX_RESOLVED_VALUES = 2000;

const remember = (value: string) => {
  // Too short to be told from ordinary text
  if (value.length < 6) return;
  if (resolvedValues.size >= MAX_RESOLVED_VALUES) resolvedValues.clear();
  resolvedValues.add(value);
};

export const getResolvedExternalValues = (): string[] => [...resolvedValues];

const fail = (message: string): never => {
  throw new NonRetriableError(message);
};

const readStoreConfig = (store: StoreRow): unknown => {
  try {
    return JSON.parse(decrypt(store.config));
  } catch {
    return fail(`The secret store "${store.name}" could not be read. Save its settings again.`);
  }
};

/**
 * Reads one secret from Vault's KV engine: its fields.
 */
const fetchVaultSecret = async (store: StoreRow, secret: string): Promise<unknown> => {
  const config = readVaultConfig(readStoreConfig(store));
  if ("error" in config) return fail(`Secret store "${store.name}": ${config.error}`);

  // The token is only ever sent to the address that was saved: a redirect
  // is refused, and private addresses are unless they were allowed
  const response = await safeFetch(vaultSecretUrl(config, secret), {
    headers: {
      "x-vault-token": config.token,
      ...(config.namespace ? { "x-vault-namespace": config.namespace } : {}),
    },
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.status === 404) return fail(`Secret store "${store.name}" has no secret "${secret}".`);
  if (response.status === 403) {
    return fail(`Secret store "${store.name}": the token may not read "${secret}" (or has expired).`);
  }
  if (!response.ok) return fail(`Secret store "${store.name}" answered ${response.status}.`);

  const body = (await response.json()) as { data?: { data?: unknown } | unknown };
  const data = config.kvVersion === 2 ? (body.data as { data?: unknown } | undefined)?.data : body.data;

  if (data === null || typeof data !== "object") {
    return fail(`Secret store "${store.name}": "${secret}" is not a KV version ${config.kvVersion} secret.`);
  }

  return data;
};

/**
 * Reads one secret from AWS Secrets Manager: its text.
 */
const fetchAwsSecret = async (store: StoreRow, secret: string): Promise<unknown> => {
  const config = readAwsConfig(readStoreConfig(store));
  if ("error" in config) return fail(`Secret store "${store.name}": ${config.error}`);

  // The address is Amazon's own for the region, never one a user typed
  const request = signAwsJsonRequest({
    service: "secretsmanager",
    region: config.region,
    target: "secretsmanager.GetSecretValue",
    body: JSON.stringify({ SecretId: secret }),
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  });

  const response = await fetch(request.url, {
    method: "POST",
    headers: request.headers,
    body: request.body,
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    // AWS says what was wrong in "__type": the name of the error, no secret
    const error = ((await response.json().catch(() => ({}))) as { __type?: string }).__type ?? "";
    const kind = error.split("#").pop() || `status ${response.status}`;

    return fail(
      kind === "ResourceNotFoundException"
        ? `Secret store "${store.name}" has no secret "${secret}".`
        : `Secret store "${store.name}" could not read "${secret}": ${kind}.`
    );
  }

  const body = (await response.json()) as { SecretString?: string };

  if (typeof body.SecretString !== "string") {
    return fail(`Secret store "${store.name}": "${secret}" is a binary secret, which cannot be used.`);
  }

  return body.SecretString;
};

/**
 * What a store holds for a secret, from this process's memory when it was
 * read a moment ago.
 */
export const readSecret = async (store: StoreRow, secret: string): Promise<unknown> => {
  if (!isSecretName(secret)) return fail(`"${secret}" is not a secret's name.`);

  // Changing a store's settings stops its remembered secrets from being used
  const key = `${store.id}:${store.updatedAt.getTime()}:${secret}`;
  const cached = cache.get(key);

  if (cached && cached.expiresAt > Date.now()) return cached.payload;

  let payload: unknown;

  try {
    payload = store.type === "vault"
      ? await fetchVaultSecret(store, secret)
      : store.type === "aws"
        ? await fetchAwsSecret(store, secret)
        : fail(`Secret store "${store.name}" is of an unknown type.`);
  } catch (error) {
    if (error instanceof NonRetriableError) throw error;

    // A timeout, a refused address, a host that does not answer. The
    // error's own text can name the address, never the token.
    return fail(
      `Secret store "${store.name}" could not be reached: ${String((error as Error)?.message ?? error).slice(0, 200)}`
    );
  }

  if (CACHE_SECONDS > 0) {
    if (cache.size > 500) cache.clear();
    cache.set(key, { payload, expiresAt: Date.now() + CACHE_SECONDS * 1000 });
  }

  return payload;
};

/**
 * A credential's text with its references replaced by what the stores of
 * that user's workspace hold. `userId` is the owner the credential is
 * stored under: a reference never reaches another workspace's store.
 */
export const resolveSecretRefs = async (text: string, userId: string): Promise<string> => {
  const refs = parseSecretRefs(text);
  if (refs.length === 0) return text;

  const stores = await prisma.secretStore.findMany({
    where: { userId, name: { in: [...new Set(refs.map((ref) => ref.store))] } },
    select: { id: true, name: true, type: true, config: true, updatedAt: true },
  });
  const byName = new Map(stores.map((store) => [store.name, store]));

  const values = new Map<string, string>();

  for (const ref of refs) {
    if (values.has(ref.raw)) continue;

    const store = byName.get(ref.store);
    if (!store) {
      return fail(`The credential reads from a secret store named "${ref.store}", and this workspace has none by that name.`);
    }

    let value: string;
    try {
      value = pickSecretValue(await readSecret(store, ref.secret), ref as SecretRef);
    } catch (error) {
      if (error instanceof NonRetriableError) throw error;
      return fail((error as Error).message);
    }

    remember(value);
    values.set(ref.raw, value);
  }

  return substituteSecrets(text, values);
};

/**
 * A stored credential as its plain value: decrypted, and with what it
 * reads from an external store read. Use this wherever a credential is
 * about to be used; `decrypt` alone gives the reference, not the secret.
 */
export const readCredentialValue = async (encrypted: string, userId: string): Promise<string> => {
  const text = decrypt(encrypted);

  return hasSecretRefs(text) ? resolveSecretRefs(text, userId) : text;
};

/**
 * Reads the external secrets of a run's credentials ahead of the run, so
 * that this process knows their values and can keep them out of what is
 * stored. Never throws: a store that is down fails the node that needs it,
 * with a message, not the whole run before it starts.
 */
export const primeExternalSecrets = async (
  userId: string,
  encryptedValues: readonly string[]
): Promise<void> => {
  await Promise.all(
    encryptedValues.map((encrypted) =>
      // Told to the user by the node that uses the credential
      readCredentialValue(encrypted, userId).catch(() => undefined)
    )
  );
};
