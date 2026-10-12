// External secrets: how a credential says "read this from the vault", and
// how a secret that was read is put in its place. Nothing here talks to a
// vault or the database, and there are no server-only imports: the
// settings page shows the same syntax, and the tests use the rules.

export const SECRET_STORE_TYPES = ["vault", "aws"] as const;

export type SecretStoreType = (typeof SECRET_STORE_TYPES)[number];

export const isSecretStoreType = (value: unknown): value is SecretStoreType =>
  (SECRET_STORE_TYPES as readonly unknown[]).includes(value);

export const SECRET_STORE_LABELS: Record<SecretStoreType, string> = {
  vault: "HashiCorp Vault",
  aws: "AWS Secrets Manager",
};

export const MAX_SECRET_STORES = 5;

// A store's name is part of every reference to it
export const isStoreName = (value: string) => /^[a-z][a-z0-9_-]{0,30}$/.test(value);

// {{$secrets.<store>.<secret>}} or {{$secrets.<store>.<secret>#<field>}}.
// The secret is its path in Vault (team/openai) or its name in AWS; the
// field picks one value out of a secret that holds several.
const SECRET_REF = /\{\{\s*\$secrets\.([a-z][a-z0-9_-]{0,30})\.([^#}\s]+?)(?:#([^}\s]+?))?\s*\}\}/g;

export type SecretRef = {
  // The text as it stands in the credential
  raw: string;
  store: string;
  secret: string;
  field: string | null;
};

export const parseSecretRefs = (text: string): SecretRef[] =>
  [...text.matchAll(SECRET_REF)].map((match) => ({
    raw: match[0],
    store: match[1],
    secret: match[2],
    field: match[3] ?? null,
  }));

export const hasSecretRefs = (text: string) => text.includes("$secrets.") && parseSecretRefs(text).length > 0;

export const formatSecretRef = (store: string, secret: string, field?: string | null) =>
  `{{$secrets.${store}.${secret}${field ? `#${field}` : ""}}}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * One value out of what a store answered. A Vault secret is a set of
 * fields, so a field has to be named. An AWS secret is a text: all of it,
 * or one field when it is JSON.
 */
export const pickSecretValue = (payload: unknown, ref: SecretRef): string => {
  const name = `${ref.store}.${ref.secret}`;

  if (ref.field === null) {
    if (typeof payload === "string") return payload;

    throw new Error(
      `The secret ${name} has several fields. Name one: ${formatSecretRef(ref.store, ref.secret, "field")}`
    );
  }

  let fields = payload;

  if (typeof payload === "string") {
    try {
      fields = JSON.parse(payload);
    } catch {
      throw new Error(`The secret ${name} is one text, not a set of fields: leave out "#${ref.field}".`);
    }
  }

  if (!isRecord(fields) || !Object.prototype.hasOwnProperty.call(fields, ref.field)) {
    throw new Error(`The secret ${name} has no field "${ref.field}".`);
  }

  const value = fields[ref.field];

  return typeof value === "string" ? value : JSON.stringify(value);
};

/**
 * The names of a secret's fields, for the settings page. Never the values.
 */
export const listSecretFields = (payload: unknown): string[] => {
  let fields = payload;

  if (typeof payload === "string") {
    try {
      fields = JSON.parse(payload);
    } catch {
      return [];
    }
  }

  return isRecord(fields) ? Object.keys(fields).sort() : [];
};

/**
 * A credential's text with every reference replaced by its value. A
 * credential that is JSON (an SMTP server, a service account) stays valid
 * JSON whatever characters the secret has: the values are put into its
 * texts, not into its source.
 */
export const substituteSecrets = (text: string, values: ReadonlyMap<string, string>): string => {
  const replace = (input: string) =>
    input.replace(SECRET_REF, (raw) => (values.has(raw) ? (values.get(raw) as string) : raw));

  const walk = (value: unknown): unknown => {
    if (typeof value === "string") return replace(value);
    if (Array.isArray(value)) return value.map(walk);

    if (isRecord(value)) {
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, walk(entry)]));
    }

    return value;
  };

  const trimmed = text.trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.stringify(walk(JSON.parse(trimmed)));
    } catch {
      // Not JSON after all: a plain text
    }
  }

  return replace(text);
};

// =========================================================================
// WHAT A STORE NEEDS TO BE REACHED
// =========================================================================
export type VaultConfig = {
  // https://vault.example.com
  url: string;
  token: string;
  // The KV secrets engine's mount, "secret" by default
  mount: string;
  // 2 (the default) or 1
  kvVersion: 1 | 2;
  // Vault Enterprise / HCP
  namespace?: string;
};

export type AwsConfig = {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export const readVaultConfig = (input: unknown): VaultConfig | { error: string } => {
  const source = isRecord(input) ? input : {};
  const url = text(source.url).replace(/\/+$/, "");
  const token = text(source.token);
  const mount = text(source.mount).replace(/^\/+|\/+$/g, "") || "secret";

  if (!/^https?:\/\/[^\s/]+/i.test(url)) return { error: "Enter the Vault's address, starting with https://" };
  if (!token) return { error: "Enter a Vault token." };
  if (!/^[A-Za-z0-9._/-]+$/.test(mount)) return { error: "The mount may only have letters, digits, . _ - and /." };

  const namespace = text(source.namespace);

  return {
    url,
    token,
    mount,
    kvVersion: String(source.kvVersion) === "1" ? 1 : 2,
    ...(namespace ? { namespace } : {}),
  };
};

export const readAwsConfig = (input: unknown): AwsConfig | { error: string } => {
  const source = isRecord(input) ? input : {};
  const region = text(source.region).toLowerCase();
  const accessKeyId = text(source.accessKeyId);
  const secretAccessKey = text(source.secretAccessKey);

  // The region becomes part of the address that is called: only a region
  if (!/^[a-z]{2}(-[a-z]+)+-\d{1,2}$/.test(region)) return { error: "Enter an AWS region such as eu-west-1." };
  if (!/^[A-Z0-9]{16,128}$/.test(accessKeyId)) return { error: "Enter the access key ID." };
  if (!secretAccessKey) return { error: "Enter the secret access key." };

  return { region, accessKeyId, secretAccessKey };
};

// A Vault path or an AWS secret name, as it may stand in a reference
export const isSecretName = (value: string) =>
  /^[A-Za-z0-9/_+=.@-]{1,512}$/.test(value) && !value.split("/").some((part) => part === ".." || part === ".");

export const vaultSecretUrl = (config: VaultConfig, secret: string) => {
  const path = secret.split("/").map(encodeURIComponent).join("/");

  return config.kvVersion === 2
    ? `${config.url}/v1/${config.mount}/data/${path}`
    : `${config.url}/v1/${config.mount}/${path}`;
};
