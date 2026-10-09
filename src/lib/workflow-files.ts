import "server-only";

import { NonRetriableError } from "inngest";
import prisma from "./db";
import { getAppUrl } from "./app-url";
import { NotFoundError, assertOwnership } from "./ownership";
import { buildFileDownloadUrl } from "./file-links";

// Files do not travel in the workflow data (it is JSON, and Inngest caps
// its size). They are stored here and the data carries this reference.
export type FileReference = {
  id: string;
  fileName: string;
  mimeType: string;
  // Bytes
  size: number;
  // Signed download link. It works for 15 minutes for anyone who has it;
  // after that only for the signed-in owner. A new one is made every time
  // a node loads the file.
  url: string;
};

const megabytes = (name: string, fallback: number) =>
  (Number(process.env[name]) || fallback) * 1024 * 1024;

export const MAX_FILE_BYTES = megabytes("MAX_FILE_SIZE_MB", 10);
// Everything one user's workflows may keep at the same time
export const MAX_USER_STORAGE_BYTES = megabytes("MAX_USER_STORAGE_MB", 200);
export const FILE_RETENTION_DAYS = Number(process.env.FILE_RETENTION_DAYS) || 7;

const describeSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(Math.round(bytes / 1024), 1)} KB`;

// No folders, no control characters, a sensible length
export const sanitizeFileName = (name: string, fallback = "file") => {
  const clean = name
    .replace(/[\\/]/g, "_")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: removing them is the point
    .replace(/[\u0000-\u001f\u007f"<>|:*?]/g, "")
    .trim()
    .slice(0, 150);

  return clean || fallback;
};

const toReference = (file: {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
}): FileReference => ({
  id: file.id,
  fileName: file.fileName,
  mimeType: file.mimeType,
  size: file.size,
  url: buildFileDownloadUrl(getAppUrl(), file.id),
});

export const assertFileSize = (label: string, bytes: number) => {
  if (bytes > MAX_FILE_BYTES) {
    throw new NonRetriableError(
      `${label} node: the file is ${describeSize(bytes)}; the limit is ${describeSize(MAX_FILE_BYTES)}`
    );
  }
};

/**
 * Stores a file made by a workflow and returns the reference that goes into
 * the workflow data. Call it inside a step.
 */
export const saveWorkflowFile = async ({
  label,
  userId,
  executionId,
  fileName,
  mimeType,
  data,
}: {
  // The node's name, for error messages
  label: string;
  userId: string;
  executionId?: string;
  fileName: string;
  mimeType: string;
  data: Buffer | Uint8Array;
}): Promise<FileReference> => {
  const bytes = Buffer.from(data);

  assertFileSize(label, bytes.length);

  const stored = await prisma.workflowFile.aggregate({
    where: { userId },
    _sum: { size: true },
  });

  if ((stored._sum.size ?? 0) + bytes.length > MAX_USER_STORAGE_BYTES) {
    throw new NonRetriableError(
      `${label} node: your workflow file storage is full (${describeSize(MAX_USER_STORAGE_BYTES)}). Files are removed automatically after ${FILE_RETENTION_DAYS} days.`
    );
  }

  const file = await prisma.workflowFile.create({
    data: {
      userId,
      executionId,
      fileName: sanitizeFileName(fileName),
      mimeType: mimeType.split(";")[0].trim() || "application/octet-stream",
      size: bytes.length,
      data: bytes,
    },
    select: { id: true, fileName: true, mimeType: true, size: true },
  });

  return toReference(file);
};

/**
 * The stored file behind a download link, for its owner only: a file id
 * from another account is "not found" (NotFoundError), like one that does
 * not exist.
 */
export const getOwnedWorkflowFile = async (fileId: string, userId: string) =>
  assertOwnership(
    await prisma.workflowFile.findUnique({ where: { id: fileId } }),
    userId,
    "File"
  );

/**
 * Loads a stored file. Scoped to its owner: a file id from another account
 * is "not found".
 */
export const loadWorkflowFile = async (
  label: string,
  fileId: string,
  userId: string
): Promise<{ reference: FileReference; data: Buffer }> => {
  let file: Awaited<ReturnType<typeof getOwnedWorkflowFile>> | null = null;
  try {
    file = await getOwnedWorkflowFile(fileId, userId);
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
  }

  if (!file) {
    throw new NonRetriableError(
      `${label} node: the file was not found. Files are removed after ${FILE_RETENTION_DAYS} days.`
    );
  }

  return { reference: toReference(file), data: Buffer.from(file.data) };
};

// Called by the daily cleanup
export const deleteExpiredWorkflowFiles = async () => {
  const cutoff = new Date(Date.now() - FILE_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const deleted = await prisma.workflowFile.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  return deleted.count;
};
