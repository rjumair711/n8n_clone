import { NonRetriableError } from "inngest";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { NodeExecutor, WorkflowContext } from "@/features/executions/types";
import { BlockedRequestError, assertPublicUrl } from "@/lib/ssrf";
import { MAX_FILE_BYTES, loadWorkflowFile, saveWorkflowFile } from "@/lib/workflow-files";
import {
  DEFAULT_LINK_MINUTES,
  MAX_LINK_MINUTES,
  type S3Credential,
  isBucketName,
  readS3Credential,
} from "@/lib/s3-options";
import { renderTemplate } from "../../lib/templates";
import { loadCredentialSecret } from "../../lib/integration";
import { resolveFileId } from "../files/executors";

// The S3 Storage node: files in the customer's own S3-compatible bucket
// (Amazon S3, Cloudflare R2, Backblaze B2, Wasabi, DigitalOcean Spaces,
// MinIO). For files larger than the workflow file limit, and for a lasting
// or temporary public link that Instagram, YouTube or a customer can fetch.

type S3Data = {
  variableName?: string;
  credentialId?: string;
  operation?: string;
  [key: string]: string | undefined;
};

const LABEL = "S3 Storage";
export const S3_OPERATIONS = ["upload", "download", "list", "get_link", "delete"];
const DEFAULT_LIST = 100;
const MAX_LIST = 1000;

const fail = (message: string) => new NonRetriableError(`${LABEL} node: ${message}`);

export type S3Request = {
  operation: string;
  bucket: string;
  key: string;
  prefix: string;
  limit: number;
  minutes: number;
  publicBaseUrl: string;
};

/** The node's settings, checked; nothing is sent. */
export const readS3Request = (data: S3Data, context: WorkflowContext): S3Request => {
  const field = (name: string) => renderTemplate(data[name], context).trim();
  const operation = data.operation || "upload";
  if (!S3_OPERATIONS.includes(operation)) throw fail(`Unsupported operation "${operation}"`);

  const bucket = field("bucket");
  if (!bucket) throw fail("Bucket is required");
  if (!isBucketName(bucket)) throw fail(`"${bucket}" is not a bucket name (lower case letters, digits, dots and hyphens)`);

  // Upload may leave the key empty: the file's own name is used
  const key = field("key").replace(/^\/+/, "");
  if (key.length > 1024) throw fail("Key is longer than 1024 characters");
  if (["download", "get_link", "delete"].includes(operation) && !key) throw fail("Key is required");

  const count = Math.floor(Number(field("limit")));
  const limit = Number.isFinite(count) && count >= 1 ? Math.min(count, MAX_LIST) : DEFAULT_LIST;

  const minutesValue = Math.floor(Number(field("expiresMinutes")));
  const minutes = Number.isFinite(minutesValue) && minutesValue >= 1 ? minutesValue : DEFAULT_LINK_MINUTES;
  if (minutes > MAX_LINK_MINUTES) throw fail(`a temporary link lasts at most ${MAX_LINK_MINUTES} minutes (7 days)`);

  const publicBaseUrl = field("publicBaseUrl").replace(/\/+$/, "");
  if (publicBaseUrl && !/^https:\/\/[^\s/]+/i.test(publicBaseUrl)) throw fail("Public Base URL must start with https://");

  return { operation, bucket, key, prefix: field("prefix"), limit, minutes, publicBaseUrl };
};

/** The lasting address of an object behind a public base (an R2 public bucket, a CDN). */
export const publicObjectUrl = (base: string, key: string) =>
  base ? `${base}/${key.split("/").map(encodeURIComponent).join("/")}` : "";

/** The SDK client for a credential. MinIO and other custom servers use path-style addresses. */
export const createS3Client = (credential: S3Credential) =>
  new S3Client({
    region: credential.region,
    ...(credential.endpoint ? { endpoint: credential.endpoint } : {}),
    forcePathStyle: credential.provider === "custom",
    credentials: { accessKeyId: credential.accessKeyId, secretAccessKey: credential.secretAccessKey },
    maxAttempts: 2,
  });

// S3's error, with what to do for the usual ones
const describeS3Error = (error: any) => {
  const name = String(error?.name ?? error?.Code ?? "");
  const message = String(error?.message ?? "the request failed");
  if (name === "NoSuchBucket") return "the bucket does not exist (check its name and the endpoint's region)";
  if (name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404) return "there is no file with that key";
  if (name === "AccessDenied" || error?.$metadata?.httpStatusCode === 403) {
    return "access denied: the key needs read and write permission on this bucket";
  }
  if (name === "InvalidAccessKeyId" || name === "SignatureDoesNotMatch") {
    return "the access key ID or secret access key is wrong, or does not belong to this endpoint";
  }
  if (name === "PermanentRedirect" || name === "AuthorizationHeaderMalformed") {
    return `${message}: the bucket is in another region, set the credential's region to it`;
  }
  return message;
};

/**
 * Upload, download, list, link and delete files in an S3-compatible bucket.
 */
export const s3StorageExecutor: NodeExecutor<S3Data> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
  executionId,
}) => {
  const variableName = data.variableName?.trim() || "storage";

  // Every check of the fields comes before the credential is read
  const request = readS3Request(data, context);
  const fileId = request.operation === "upload" ? resolveFileId(LABEL, context, data.file) : null;

  const secret = await loadCredentialSecret({
    step,
    stepId: `s3-${nodeId}-get-credential`,
    credentialId: data.credentialId,
    userId,
    label: LABEL,
  });

  let credential: S3Credential;
  try {
    credential = readS3Credential(JSON.parse(secret));
  } catch (error) {
    throw fail(`the credential is not valid: ${error instanceof Error ? error.message : "it could not be read"}`);
  }

  try {
    const result = await step.run(`s3-${nodeId}-${request.operation}`, async () => {
      // The endpoint gets the signed requests: never a private address
      if (credential.endpoint) await assertPublicUrl(credential.endpoint);
      const client = createS3Client(credential);
      const { bucket } = request;

      if (request.operation === "upload") {
        const file = await loadWorkflowFile(LABEL, fileId!, userId);
        const key = request.key || file.reference.fileName;
        const sent = await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: file.data,
            ContentType: file.reference.mimeType || "application/octet-stream",
          })
        );
        return {
          bucket,
          key,
          size: file.data.length,
          etag: String(sent.ETag ?? "").replace(/"/g, ""),
          url: publicObjectUrl(request.publicBaseUrl, key),
        };
      }

      if (request.operation === "download") {
        // Larger than the workflow file limit: refused before downloading
        const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: request.key }));
        if (Number(head.ContentLength ?? 0) > MAX_FILE_BYTES) {
          throw fail(
            `"${request.key}" is ${Math.ceil(Number(head.ContentLength) / (1024 * 1024))} MB; a workflow file is at most ${MAX_FILE_BYTES / (1024 * 1024)} MB. Use Get Link to hand it on instead.`
          );
        }
        const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: request.key }));
        const bytes = await object.Body!.transformToByteArray();
        const file = await saveWorkflowFile({
          label: LABEL,
          userId,
          executionId,
          fileName: request.key.split("/").pop() || "download",
          mimeType: object.ContentType || "application/octet-stream",
          data: bytes,
        });
        return { bucket, key: request.key, size: bytes.length, file };
      }

      if (request.operation === "list") {
        const listed = await client.send(
          new ListObjectsV2Command({ Bucket: bucket, ...(request.prefix ? { Prefix: request.prefix } : {}), MaxKeys: request.limit })
        );
        const items = (listed.Contents ?? []).map((object) => ({
          key: object.Key ?? "",
          size: Number(object.Size ?? 0),
          lastModified: object.LastModified ? new Date(object.LastModified).toISOString() : null,
          url: publicObjectUrl(request.publicBaseUrl, object.Key ?? ""),
        }));
        return { bucket, items, count: items.length, truncated: !!listed.IsTruncated };
      }

      if (request.operation === "get_link") {
        // Checks that the file is there, so a typo is an error now, not a dead link later
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: request.key }));
        const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: request.key }), {
          expiresIn: request.minutes * 60,
        });
        return {
          bucket,
          key: request.key,
          url,
          expiresAt: new Date(Date.now() + request.minutes * 60 * 1000).toISOString(),
          publicUrl: publicObjectUrl(request.publicBaseUrl, request.key),
        };
      }

      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: request.key }));
      return { bucket, key: request.key, deleted: true };
    });

    return { ...context, [variableName]: result };
  } catch (error: any) {
    if (error instanceof NonRetriableError) throw error;
    if (error instanceof BlockedRequestError) throw fail(error.message);
    throw fail(describeS3Error(error));
  }
};
