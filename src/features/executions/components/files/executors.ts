import { Readable } from "node:stream";
import { google } from "googleapis";
import { NonRetriableError } from "inngest";
import prisma from "@/lib/db";
import { getGoogleAuthFromCredential } from "@/lib/google-oauth";
import {
  MAX_FILE_BYTES,
  assertFileSize,
  loadWorkflowFile,
  saveWorkflowFile,
  type FileReference,
} from "@/lib/workflow-files";
import type { NodeExecutor, WorkflowContext } from "@/features/executions/types";
import { renderTemplate } from "../../lib/templates";
import { getValueByPath } from "../../lib/conditions";
import {
  isTextMimeType,
  mimeTypeForName,
  parseCsvLimited,
  toCsv,
} from "../../lib/file-formats";
import { CSV_MAX_ROWS, FileLimitError } from "../../lib/file-limits";
import { PDF_PAGE_SIZES, generatePdf, type PdfPageSize } from "../../lib/pdf";
import {
  extractDocxText,
  extractPdfText,
  readXlsx,
  writeXlsx,
} from "../../lib/file-readers";

type FileNodeData = {
  variableName?: string;
  credentialId?: string;
  operation?: string;
  [key: string]: string | undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const requireVariableName = (label: string, data: FileNodeData) => {
  const name = data.variableName?.trim();
  if (!name) {
    throw new NonRetriableError(`${label} node: Variable name is missing`);
  }
  return name;
};

/**
 * Finds the file a node's "File" field points at. The field may hold the
 * variable of a file ("pdf.file"), of a node that produced one ("pdf"), a
 * {{template}} that renders to a file id, or be empty inside a list whose
 * items are files.
 */
export const resolveFileId = (
  label: string,
  context: WorkflowContext,
  field: string | undefined,
  incomingItems?: unknown[] | null
): string => {
  const raw = (field || "").trim();

  const fromValue = (value: unknown): string | undefined => {
    if (!isRecord(value)) return undefined;
    if (typeof value.id === "string" && "fileName" in value) return value.id;

    // A node's result: { file: {...} }, or an HTTP Request's { httpResponse: { file } }
    return (
      fromValue(value.file) ??
      fromValue((value.httpResponse as Record<string, unknown> | undefined)?.file)
    );
  };

  if (!raw) {
    const candidate = "itemIndex" in context ? context.item : incomingItems?.[0];
    const id = fromValue(candidate);
    if (id) return id;

    throw new NonRetriableError(`${label} node: File is required`);
  }

  const id =
    fromValue(getValueByPath(context, raw)) ?? renderTemplate(raw, context).trim();

  // File ids are plain letters and digits; anything else is a variable
  // name that did not lead to a file
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new NonRetriableError(
      `${label} node: "${raw}" is not a file. Use the variable of a node that produced one, for example pdf.file`
    );
  }

  return id;
};

const toFileError = (label: string, error: any) =>
  error instanceof NonRetriableError
    ? error
    : new NonRetriableError(`${label} node failed: ${error?.message || "unknown error"}`);

// =========================================================================
// PDF GENERATOR
// =========================================================================
export const pdfGeneratorExecutor: NodeExecutor<FileNodeData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
  executionId,
}) => {
  const variableName = requireVariableName("PDF Generator", data);

  const content = renderTemplate(data.content, context);
  const title = renderTemplate(data.title, context).trim();

  if (!content.trim() && !title) {
    throw new NonRetriableError("PDF Generator node: Content is required");
  }

  const fileName =
    (renderTemplate(data.fileName, context).trim() || title || "document").replace(
      /\.pdf$/i,
      ""
    ) + ".pdf";

  try {
    const result = await step.run(`pdf-generator-${nodeId}`, async () => {
      const { bytes, pages } = await generatePdf({
        title,
        content,
        pageSize: (data.pageSize && data.pageSize in PDF_PAGE_SIZES
          ? data.pageSize
          : "A4") as PdfPageSize,
        fontSize: Number(data.fontSize) || 11,
      });

      const file = await saveWorkflowFile({
        label: "PDF Generator",
        userId,
        executionId,
        fileName,
        mimeType: "application/pdf",
        data: bytes,
      });

      return { file, pages };
    });

    return { ...context, [variableName]: result };
  } catch (error) {
    throw toFileError("PDF Generator", error);
  }
};

// =========================================================================
// CONVERT TO FILE
// =========================================================================
/**
 * Turns workflow data into a file: text as it is, any value as JSON, or a
 * list of objects as CSV.
 */
export const convertToFileExecutor: NodeExecutor<FileNodeData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
  executionId,
  items: incomingItems,
}) => {
  const variableName = requireVariableName("Convert to File", data);
  const operation = data.operation || "text";

  // JSON and CSV take their data from a variable, or from the items of the
  // list node connected before this one
  const readInput = (): unknown => {
    const path = (data.inputPath || "").trim();

    if (path) {
      const value = getValueByPath(context, path);
      if (value === undefined) {
        throw new NonRetriableError(`Convert to File node: "${path}" does not exist`);
      }
      // Lists made by the list nodes are stored as { items, count }
      return isRecord(value) && Array.isArray(value.items) ? value.items : value;
    }

    if (incomingItems) return incomingItems;

    throw new NonRetriableError(
      "Convert to File node: Input Data is required when no list node is connected before it"
    );
  };

  let text: string;
  let extension: string;
  let spreadsheetRows: unknown[] | null = null;

  switch (operation) {
    case "text":
      text = renderTemplate(data.content, context);
      extension = "txt";
      break;

    case "json":
      text = JSON.stringify(readInput(), null, 2);
      extension = "json";
      break;

    case "csv": {
      const input = readInput();
      const rows = Array.isArray(input) ? input : [input];
      text = toCsv(rows, data.delimiter === "semicolon" ? ";" : ",");
      extension = "csv";
      break;
    }

    case "xlsx": {
      const input = readInput();
      // Written inside the step below: building a workbook is slow
      spreadsheetRows = Array.isArray(input) ? input : [input];
      text = "";
      extension = "xlsx";
      break;
    }

    default:
      throw new NonRetriableError(
        `Convert to File node: Unsupported operation "${operation}"`
      );
  }

  const named = renderTemplate(data.fileName, context).trim();
  const fileName = named
    ? /\.[a-z0-9]{1,8}$/i.test(named)
      ? named
      : `${named}.${extension}`
    : `file.${extension}`;

  try {
    const result = await step.run(`convert-to-file-${nodeId}`, async () => ({
      file: await saveWorkflowFile({
        label: "Convert to File",
        userId,
        executionId,
        fileName,
        mimeType: mimeTypeForName(fileName),
        data: spreadsheetRows
          ? await writeXlsx(
              spreadsheetRows,
              renderTemplate(data.sheetName, context).trim() || "Sheet1"
            )
          : Buffer.from(text, "utf8"),
      }),
    }));

    return { ...context, [variableName]: result };
  } catch (error) {
    throw toFileError("Convert to File", error);
  }
};

// =========================================================================
// EXTRACT FROM FILE
// =========================================================================
/**
 * Reads a file back into workflow data: its text, its JSON, or the rows of
 * a CSV (which go on as items).
 */
export const extractFromFileExecutor: NodeExecutor<FileNodeData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
  items: incomingItems,
}) => {
  const variableName = requireVariableName("Extract from File", data);
  const operation = data.operation || "text";

  if (!["text", "json", "csv", "xlsx", "pdf", "docx"].includes(operation)) {
    throw new NonRetriableError(
      `Extract from File node: Unsupported operation "${operation}"`
    );
  }

  const fileId = resolveFileId("Extract from File", context, data.file, incomingItems);

  try {
    const result = await step.run(`extract-from-file-${nodeId}`, async () => {
      const { reference, data: bytes } = await loadWorkflowFile(
        "Extract from File",
        fileId,
        userId
      );

      const fileName = reference.fileName;

      // A wrong file type gives a confusing parser error; say what it is
      const wrongType = (expected: string) =>
        new NonRetriableError(
          `Extract from File node: "${fileName}" could not be read as ${expected}. Pick the operation that matches the file.`
        );

      // A file over one of the limits says so; anything else the parser
      // rejects means the file is not of that type
      const readError = (error: unknown, expected: string) =>
        error instanceof FileLimitError
          ? new NonRetriableError(
              `Extract from File node: "${fileName}" was not read: ${error.message}.`
            )
          : wrongType(expected);

      if (operation === "pdf") {
        try {
          const extracted = await extractPdfText(bytes);

          return { ...extracted, fileName };
        } catch (error) {
          throw readError(error, "a PDF");
        }
      }

      if (operation === "docx") {
        try {
          return { ...(await extractDocxText(bytes)), fileName };
        } catch (error) {
          throw readError(error, "a Word (.docx) document");
        }
      }

      if (operation === "xlsx") {
        let sheet: Awaited<ReturnType<typeof readXlsx>>;
        try {
          sheet = await readXlsx(bytes, {
            sheet: renderTemplate(data.sheetName, context).trim() || undefined,
            header: data.header !== "no",
          });
        } catch (error: any) {
          // A missing sheet name is the user's to fix; anything else is the file
          if (/no sheet/i.test(String(error?.message))) {
            throw new NonRetriableError(`Extract from File node: ${error.message}`);
          }
          throw readError(error, "an Excel (.xlsx) workbook");
        }

        return { ...sheet, count: sheet.items.length, fileName };
      }

      if (!isTextMimeType(reference.mimeType)) {
        throw new NonRetriableError(
          `Extract from File node: "${fileName}" (${reference.mimeType}) is not a text file. Use the PDF, Word or Excel operation for those files.`
        );
      }

      const text = bytes.toString("utf8");

      if (operation === "json") {
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new NonRetriableError(
            `Extract from File node: "${reference.fileName}" is not valid JSON`
          );
        }

        return Array.isArray(parsed)
          ? { items: parsed, count: parsed.length, fileName: reference.fileName }
          : { data: parsed, fileName: reference.fileName };
      }

      if (operation === "csv") {
        // "Max Rows" of the node, never more than the server's limit
        const requested = Number(renderTemplate(data.maxRows, context).trim());
        const maxRows =
          Number.isFinite(requested) && requested >= 1
            ? Math.min(Math.floor(requested), CSV_MAX_ROWS)
            : CSV_MAX_ROWS;

        const { items, truncated } = parseCsvLimited(text, {
          delimiter: data.delimiter === "semicolon" ? ";" : ",",
          header: data.header !== "no",
          maxRows,
        });

        return { items, count: items.length, truncated, fileName: reference.fileName };
      }

      return { text, fileName: reference.fileName };
    });

    return { ...context, [variableName]: result };
  } catch (error) {
    throw toFileError("Extract from File", error);
  }
};

// =========================================================================
// GOOGLE DRIVE
// =========================================================================
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

// Google's own formats have no file content; they are exported instead
const GOOGLE_EXPORTS: Record<string, { mimeType: string; extension: string }> = {
  "application/vnd.google-apps.document": { mimeType: "application/pdf", extension: "pdf" },
  "application/vnd.google-apps.presentation": { mimeType: "application/pdf", extension: "pdf" },
  "application/vnd.google-apps.spreadsheet": { mimeType: "text/csv", extension: "csv" },
  "application/vnd.google-apps.drawing": { mimeType: "image/png", extension: "png" },
};

// Accepts an id, or a link copied from the browser
export const parseDriveId = (value: string): string => {
  const text = value.trim();

  return (
    text.match(/\/(?:d|folders)\/([A-Za-z0-9_-]{10,})/)?.[1] ??
    text.match(/[?&]id=([A-Za-z0-9_-]{10,})/)?.[1] ??
    text
  );
};

const summarizeDriveFile = (file: any) => ({
  id: file.id,
  name: file.name,
  mimeType: file.mimeType,
  size: file.size ? Number(file.size) : null,
  isFolder: file.mimeType === FOLDER_MIME_TYPE,
  webViewLink: file.webViewLink ?? null,
  modifiedTime: file.modifiedTime ?? null,
  parents: file.parents ?? [],
});

const DRIVE_FIELDS = "id,name,mimeType,size,webViewLink,modifiedTime,parents";

export const googleDriveExecutor: NodeExecutor<FileNodeData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
  executionId,
  items: incomingItems,
}) => {
  const variableName = requireVariableName("Google Drive", data);
  const operation = data.operation || "search_files";

  if (!data.credentialId) {
    throw new NonRetriableError("Google Drive node: Credential is required");
  }

  const field = (name: string) => renderTemplate(data[name], context).trim();
  const required = (name: string, title: string) => {
    const value = field(name);
    if (!value) {
      throw new NonRetriableError(`Google Drive node: ${title} is required`);
    }
    return value;
  };

  // Checked before any step runs, so mistakes fail early
  const uploadFileId =
    operation === "upload_file"
      ? resolveFileId("Google Drive", context, data.file, incomingItems)
      : "";

  const credential = await step.run(`google-drive-${nodeId}-get-credential`, async () => {
    return prisma.credential.findUnique({
      where: { id: data.credentialId, userId },
    });
  });

  if (!credential) {
    throw new NonRetriableError("Google Drive node: Credential not found");
  }

  try {
    const result = await step.run(`google-drive-${nodeId}-${operation}`, async () => {
      const drive = google.drive({
        version: "v3",
        auth: getGoogleAuthFromCredential("Google Drive", credential.value),
      });

      const folderId = field("folderId") ? parseDriveId(field("folderId")) : undefined;

      switch (operation) {
        case "upload_file": {
          const { reference, data: bytes } = await loadWorkflowFile(
            "Google Drive",
            uploadFileId,
            userId
          );

          const created = await drive.files.create({
            requestBody: {
              name: field("fileName") || reference.fileName,
              ...(folderId ? { parents: [folderId] } : {}),
            },
            media: { mimeType: reference.mimeType, body: Readable.from(bytes) },
            fields: DRIVE_FIELDS,
          });

          return summarizeDriveFile(created.data);
        }

        case "download_file": {
          const driveFileId = parseDriveId(required("fileId", "File"));

          const metadata = await drive.files.get({
            fileId: driveFileId,
            fields: "id,name,mimeType,size",
          });

          const mimeType = metadata.data.mimeType || "application/octet-stream";
          const name = metadata.data.name || "file";

          if (mimeType === FOLDER_MIME_TYPE) {
            throw new NonRetriableError(
              "Google Drive node: that is a folder, not a file"
            );
          }

          let bytes: Buffer;
          let fileName = name;
          let fileMimeType = mimeType;

          if (mimeType.startsWith("application/vnd.google-apps.")) {
            const target = GOOGLE_EXPORTS[mimeType];
            if (!target) {
              throw new NonRetriableError(
                `Google Drive node: files of type ${mimeType} cannot be downloaded`
              );
            }

            const exported = await drive.files.export(
              { fileId: driveFileId, mimeType: target.mimeType },
              { responseType: "arraybuffer" }
            );

            bytes = Buffer.from(exported.data as ArrayBuffer);
            fileName = `${name}.${target.extension}`;
            fileMimeType = target.mimeType;
          } else {
            // Checked before downloading, so a huge file is never fetched
            assertFileSize("Google Drive", Number(metadata.data.size) || 0);

            const downloaded = await drive.files.get(
              { fileId: driveFileId, alt: "media" },
              { responseType: "arraybuffer" }
            );

            bytes = Buffer.from(downloaded.data as ArrayBuffer);
          }

          const file = await saveWorkflowFile({
            label: "Google Drive",
            userId,
            executionId,
            fileName,
            mimeType: fileMimeType,
            data: bytes,
          });

          return { file, driveFileId, name };
        }

        case "search_files": {
          const conditions = ["trashed = false"];

          const name = field("query");
          if (name) {
            conditions.push(
              `name contains '${name.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`
            );
          }
          if (folderId) conditions.push(`'${folderId}' in parents`);

          const listed = await drive.files.list({
            q: conditions.join(" and "),
            pageSize: Math.min(Math.max(Number(field("limit")) || 20, 1), 100),
            orderBy: "modifiedTime desc",
            fields: `files(${DRIVE_FIELDS})`,
          });

          const files = (listed.data.files ?? []).map(summarizeDriveFile);

          return { files, count: files.length };
        }

        case "create_folder": {
          const created = await drive.files.create({
            requestBody: {
              name: required("folderName", "Folder Name"),
              mimeType: FOLDER_MIME_TYPE,
              ...(folderId ? { parents: [folderId] } : {}),
            },
            fields: DRIVE_FIELDS,
          });

          return summarizeDriveFile(created.data);
        }

        case "delete_file": {
          const driveFileId = parseDriveId(required("fileId", "File"));
          await drive.files.delete({ fileId: driveFileId });

          return { deleted: true, id: driveFileId };
        }

        default:
          throw new NonRetriableError(
            `Google Drive node: Unsupported operation "${operation}"`
          );
      }
    });

    return { ...context, [variableName]: result };
  } catch (error: any) {
    if (error instanceof NonRetriableError) throw error;

    const message = String(error?.message || "unknown error");

    throw new NonRetriableError(
      /insufficient|scope/i.test(message)
        ? "Google Drive node: this Google account was connected before Drive access was added. Connect it again under Credentials."
        : `Google Drive API error: ${message}`
    );
  }
};

export { MAX_FILE_BYTES };
export type { FileReference };

// =========================================================================
// ATTACHMENTS (used by the email and messaging nodes)
// =========================================================================
export type LoadedFile = { fileName: string; mimeType: string; data: Buffer };

/**
 * Reads an "Attachments" field: file variables separated by commas. Call it
 * before any step runs, so a wrong variable fails early.
 */
export const resolveFileIds = (
  label: string,
  context: WorkflowContext,
  field: string | undefined
): string[] =>
  (field || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => resolveFileId(label, context, entry));

export const loadFiles = async (
  label: string,
  fileIds: string[],
  userId: string
): Promise<LoadedFile[]> => {
  const files: LoadedFile[] = [];

  for (const fileId of fileIds) {
    const file = await loadWorkflowFile(label, fileId, userId);

    files.push({
      fileName: file.reference.fileName,
      mimeType: file.reference.mimeType,
      data: file.data,
    });
  }

  return files;
};
