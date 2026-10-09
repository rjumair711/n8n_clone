import { createHmac, timingSafeEqual } from "crypto";

// Download links for workflow files. Nothing here touches the database, so
// it can be tested on its own.
//
//   <app>/api/files/<fileId>?expires=<unix seconds>&signature=<HMAC-SHA256>
//
// Whoever has the link can download the file until it expires, without
// signing in: that is what lets a workflow hand a file to another service.
// The signature covers the file id and the expiry time, so neither can be
// changed, and it is made with the app's ENCRYPTION_KEY.

export const DOWNLOAD_LINK_TTL_SECONDS = 15 * 60;

const signingSecrets = (): string[] => {
  const current = process.env.ENCRYPTION_KEY;

  if (!current) {
    throw new Error("ENCRYPTION_KEY is not set");
  }

  // Links made just before a key change stay valid for their 15 minutes
  const previous = process.env.ENCRYPTION_KEY_PREVIOUS;

  return previous && previous !== current ? [current, previous] : [current];
};

const sign = (secret: string, fileId: string, expires: number) =>
  createHmac("sha256", secret)
    .update(`file-download:${fileId}:${expires}`)
    .digest("base64url");

/**
 * The query string of a download link for the file that works until
 * `ttlSeconds` from now.
 */
export const signFileDownload = (
  fileId: string,
  {
    now = Date.now(),
    ttlSeconds = DOWNLOAD_LINK_TTL_SECONDS,
  }: { now?: number; ttlSeconds?: number } = {}
) => {
  const expires = Math.floor(now / 1000) + ttlSeconds;

  return { expires, signature: sign(signingSecrets()[0], fileId, expires) };
};

export const buildFileDownloadUrl = (
  appUrl: string,
  fileId: string,
  options?: { now?: number; ttlSeconds?: number }
) => {
  const { expires, signature } = signFileDownload(fileId, options);

  return `${appUrl}/api/files/${encodeURIComponent(fileId)}?expires=${expires}&signature=${signature}`;
};

export type FileLinkCheck = "valid" | "expired" | "invalid" | "unsigned";

/**
 * Checks the `expires` and `signature` of a download link for this file.
 *
 *   valid     signed by this app and not expired yet
 *   expired   signed by this app, but past its time
 *   invalid   the signature does not match (changed, or for another file)
 *   unsigned  the link has no signature at all
 */
export const verifyFileDownload = (
  fileId: string,
  expiresParam: string | null | undefined,
  signatureParam: string | null | undefined,
  now: number = Date.now()
): FileLinkCheck => {
  if (!expiresParam && !signatureParam) return "unsigned";
  if (!expiresParam || !signatureParam || !/^\d{1,12}$/.test(expiresParam)) {
    return "invalid";
  }

  const expires = Number(expiresParam);
  const provided = Buffer.from(signatureParam);

  const matches = signingSecrets().some((secret) => {
    const expected = Buffer.from(sign(secret, fileId, expires));

    return expected.length === provided.length && timingSafeEqual(expected, provided);
  });

  if (!matches) return "invalid";

  return expires * 1000 >= now ? "valid" : "expired";
};

const MIME_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/i;

// A stored type that is not a well-formed media type is sent as plain bytes
export const safeContentType = (mimeType: string | null | undefined) => {
  const type = (mimeType ?? "").split(";")[0].trim().toLowerCase();

  return MIME_TYPE.test(type) ? type : "application/octet-stream";
};

/**
 * The response headers of a file download. The content comes from a
 * workflow, so it is always saved as a file and never shown as a page of
 * this site: "attachment", the stored type with sniffing switched off, and
 * a sandbox for browsers that would render it anyway.
 */
export const buildDownloadHeaders = (file: {
  fileName: string;
  mimeType: string;
  size: number;
}): Record<string, string> => {
  // Plain ASCII for old clients, and the real name for everyone else
  const asciiName =
    file.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || "file";

  return {
    "Content-Type": safeContentType(file.mimeType),
    "Content-Length": String(file.size),
    "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'",
    // The link is a secret: it is not passed on, and nothing caches the file
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "private, no-store",
  };
};
