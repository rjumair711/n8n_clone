// Keeps secrets out of what is stored about a run (node input, output and
// errors) and out of what is sent to Sentry. No server-only imports: the
// browser's Sentry setup uses it too.

export const REDACTED = "[REDACTED]";

// Shorter values are left alone: redacting "22" or "true" wherever it
// appears would wreck the data without protecting anything
const MIN_SECRET_LENGTH = 6;

// Fields of a credential stored as JSON that are not secrets (the SMTP host,
// the SSH user...). Redacting them would only make the logs harder to read.
const NON_SECRET_CREDENTIAL_KEYS = new Set([
  "host",
  "port",
  "user",
  "username",
  "email",
  "fromname",
  "clientemail",
  "client_email",
  "projectid",
  "project_id",
  "authtype",
  "hostfingerprint",
  "instanceurl",
  "instance_url",
  "environment",
  "scope",
  "token_type",
  "tokentype",
  "expiry_date",
  "expiresat",
  "issued_at",
  "id",
  "type",
]);

const addSecret = (secrets: Set<string>, value: unknown) => {
  if (typeof value !== "string") return;

  const text = value.trim();
  if (text.length >= MIN_SECRET_LENGTH) secrets.add(text);
};

const collectFromJson = (secrets: Set<string>, value: unknown) => {
  if (Array.isArray(value)) {
    for (const item of value) collectFromJson(secrets, item);
  } else if (value !== null && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      if (typeof inner === "string") {
        if (!NON_SECRET_CREDENTIAL_KEYS.has(key.toLowerCase())) {
          addSecret(secrets, inner);
        }
      } else {
        collectFromJson(secrets, inner);
      }
    }
  }
};

/**
 * The secret texts inside decrypted credential values, longest first:
 *
 *   an API key or token            the value itself
 *   JSON (SMTP, SSH, OAuth...)     its text fields, except the ones that are
 *                                  not secrets (host, username, ...)
 *   postgresql://user:pass@host    the whole string and the password
 *   AccountSID:AuthToken,          the whole string and the part after the
 *   "X-API-Key: value"             first colon
 */
export const collectCredentialSecrets = (values: readonly string[]): string[] => {
  const secrets = new Set<string>();

  for (const raw of values) {
    const value = (raw ?? "").trim();
    if (!value) continue;

    if (value.startsWith("{") || value.startsWith("[")) {
      try {
        collectFromJson(secrets, JSON.parse(value));
        continue;
      } catch {
        // Not JSON after all: treated as plain text below
      }
    }

    addSecret(secrets, value);

    const urlPassword = /^[a-z][a-z0-9+.-]*:\/\/[^\s/:@]*:([^\s/@]+)@/i.exec(value)?.[1];

    if (urlPassword) {
      addSecret(secrets, urlPassword);
      try {
        addSecret(secrets, decodeURIComponent(urlPassword));
      } catch {
        // Not percent-encoded
      }
    } else if (value.includes(":") && !/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
      addSecret(secrets, value.slice(value.indexOf(":") + 1));
    }
  }

  // Longest first, so a secret that contains another is replaced whole
  return [...secrets].sort((a, b) => b.length - a.length);
};

// Headers whose value is a secret whatever it looks like
const SECRET_HEADER_NAMES = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
]);

export const isSecretHeaderName = (key: string) =>
  SECRET_HEADER_NAMES.has(key.toLowerCase());

const SECRET_HEADERS = "(?:proxy-)?authorization|(?:set-)?cookie|x-api-key";

// Each pattern keeps what identifies the kind of secret and drops the rest.
// The name is what findSecretPatterns reports.
const PATTERNS: [RegExp, string, string][] = [
  // "Authorization: Basic abc", "Cookie: a=b; c=d", x-api-key=abc, and the
  // same inside JSON text: "authorization":"Bearer abc" (quotes are kept)
  [
    new RegExp(
      `(["']?\\b(?:${SECRET_HEADERS})["']?\\s*[:=]\\s*)(?:(["'])[^"'\\r\\n]*\\2|[^\\r\\n"'},]+)`,
      "gi"
    ),
    `$1$2${REDACTED}$2`,
    "an Authorization, Cookie or X-API-Key header value",
  ],
  // Bearer tokens anywhere else
  [/\b(Bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi, `$1 ${REDACTED}`, "a Bearer token"],
  // JSON Web Tokens: header.payload.signature, each base64url
  [/\beyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, REDACTED, "a JSON Web Token"],
  // OpenAI, Anthropic and other "sk-" keys
  [/\bsk-[A-Za-z0-9_-]{16,}/g, REDACTED, 'an "sk-" API key'],
  // AWS access key ids
  [/\bAKIA[0-9A-Z]{16}\b/g, REDACTED, "an AWS access key id"],
  // Slack tokens
  [/\bxox[bpa]-[A-Za-z0-9-]{10,}/g, REDACTED, "a Slack token"],
  // GitHub tokens
  [/\bghp_[A-Za-z0-9]{20,}/g, REDACTED, "a GitHub token"],
  // The password in scheme://user:password@host
  [/\b([a-z][a-z0-9+.-]*:\/\/[^\s/:@]*):[^\s/@]+@/gi, `$1:${REDACTED}@`, "a password in a URL"],
];

export const redactPatterns = (text: string): string => {
  let output = text;

  for (const [pattern, replacement] of PATTERNS) {
    output = output.replace(pattern, replacement);
  }

  return output;
};

const EXPRESSION = /\{\{[\s\S]*?\}\}/g;

// What is left of "Bearer {{ token }}" once the expression is gone: a scheme
// word on its own is not a secret
const NOT_A_VALUE = /^["'\s]*(?:bearer|basic|token|digest)?["'\s]*$/i;

/**
 * Whether a text holds a value typed in by hand. Nothing but {{ }}
 * expressions, with or without "Bearer" in front, is not: the value comes
 * from somewhere else when the workflow runs.
 */
export const hasLiteralValue = (text: string): boolean =>
  !NOT_A_VALUE.test(text.replace(EXPRESSION, ""));

/**
 * The kinds of secret (the same patterns redactPatterns replaces) typed
 * into a text, by name. Never the secrets themselves. {{ }} expressions are
 * ignored, so "Authorization: Bearer {{ token }}" is not reported.
 */
export const findSecretPatterns = (text: string): string[] => {
  let literal = text.replace(EXPRESSION, "");
  const found: string[] = [];

  for (const [pattern, replacement, name] of PATTERNS) {
    for (const match of literal.matchAll(pattern)) {
      // Past what the pattern keeps (the header name, "Bearer"...)
      if (hasLiteralValue(match[0].slice((match[1] ?? "").length))) {
        found.push(name);
        break;
      }
    }

    // What one pattern found is not reported again by the next: the token
    // in "Authorization: Bearer abc" is one secret, not two
    literal = literal.replace(pattern, replacement);
  }

  return found;
};

export type RedactOptions = {
  // From collectCredentialSecrets: replaced wherever they appear
  secrets?: readonly string[];
  // The well-known secret shapes (sk-..., JWTs, Authorization headers...).
  // On unless switched off.
  patterns?: boolean;
};

export const redactString = (text: string, options: RedactOptions = {}): string => {
  let output = text;

  for (const secret of options.secrets ?? []) {
    if (secret && output.includes(secret)) {
      output = output.split(secret).join(REDACTED);
    }
  }

  return options.patterns === false ? output : redactPatterns(output);
};

const MAX_DEPTH = 40;

const redactInner = (
  value: unknown,
  options: RedactOptions,
  depth: number,
  seen: WeakSet<object>
): unknown => {
  if (typeof value === "string") return redactString(value, options);

  if (value === null || typeof value !== "object") return value;

  if (value instanceof Date) return value;

  // Far too deep, or pointing back at one of its own parents: not something
  // to walk. "seen" holds the parents only, so data that is merely used in
  // two places is still copied in both.
  if (depth >= MAX_DEPTH || seen.has(value)) return REDACTED;
  seen.add(value);

  let output: unknown;

  if (Array.isArray(value)) {
    output = value.map((item) => redactInner(item, options, depth + 1, seen));
  } else {
    const copy: Record<string, unknown> = {};

    for (const [key, inner] of Object.entries(value)) {
      copy[key] =
        options.patterns !== false &&
        isSecretHeaderName(key) &&
        inner !== null &&
        inner !== undefined &&
        inner !== ""
          ? REDACTED
          : redactInner(inner, options, depth + 1, seen);
    }

    output = copy;
  }

  seen.delete(value);

  return output;
};

/**
 * A copy of the value with secrets replaced by "[REDACTED]", in every text
 * at any depth. The value itself is not changed: the run goes on with the
 * real data, only the stored copy is redacted.
 */
export const redactValue = <T>(value: T, options: RedactOptions = {}): T =>
  redactInner(value, options, 0, new WeakSet()) as T;

/**
 * For Sentry's beforeSend, beforeSendTransaction and beforeSendLog: the same
 * redaction, on whatever is about to leave the app. Never throws, so a
 * problem here cannot stop an error from being reported.
 */
export const redactForSentry = <T>(event: T): T => {
  try {
    return redactValue(event);
  } catch {
    return event;
  }
};
