import type { drive_v3 } from "googleapis";
import ky from "ky";
import { MAX_FILE_BYTES } from "@/lib/workflow-files";
import { extractDocxText, extractPdfText } from "../../lib/file-readers";

// Where the Document Loader gets its documents: the files of a Google Drive
// folder, or the pages of a Notion database. For each source there is a
// function that lists the documents (cheap: names and modified times) and
// one that reads a document's text.

export type SourceDocument = {
  // The source's own id: a Drive file id, a Notion page id
  id: string;
  title: string;
  url: string | null;
  // Changes when the document does: a modified time. Null when unknown.
  version: string | null;
  // Drive only
  mimeType?: string;
  size?: number | null;
  // Notion only: the page's properties, read from the listing
  properties?: string;
};

export type SourceListing = {
  documents: SourceDocument[];
  // More documents exist than the run may read
  truncated: boolean;
  // Entries that are not documents: sub-folders
  ignored: number;
};

export type DocumentText =
  | { text: string; markdown: boolean }
  // Not read, and why
  | { skip: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const megabytes = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

// =========================================================================
// GOOGLE DRIVE
// =========================================================================
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

export type DriveFileKind =
  | "google-doc"
  | "google-sheet"
  | "google-slides"
  | "text"
  | "pdf"
  | "docx";

/**
 * How a Drive file's text is read, or null for a file that has none the
 * loader can get at (pictures, video, archives, old Office formats).
 */
export const classifyDriveFile = (mimeType: string, name: string): DriveFileKind | null => {
  const type = mimeType.split(";")[0].trim().toLowerCase();
  const extension = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? "";

  if (type === "application/vnd.google-apps.document") return "google-doc";
  if (type === "application/vnd.google-apps.spreadsheet") return "google-sheet";
  if (type === "application/vnd.google-apps.presentation") return "google-slides";
  if (type.startsWith("application/vnd.google-apps.")) return null;

  if (type === "application/pdf") return "pdf";
  if (type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";

  if (
    type.startsWith("text/") ||
    ["application/json", "application/xml", "application/x-yaml", "application/x-ndjson"].includes(type)
  ) {
    return "text";
  }

  // Uploaded without a useful type: the name decides
  if (["md", "markdown", "txt", "csv", "json", "html", "htm", "yaml", "yml"].includes(extension)) {
    return "text";
  }
  if (extension === "pdf") return "pdf";
  if (extension === "docx") return "docx";

  return null;
};

const isMarkdownFile = (mimeType: string, name: string) =>
  /markdown/i.test(mimeType) || /\.(md|markdown)$/i.test(name);

/**
 * The files directly inside a folder, most recently changed first.
 * Sub-folders are not opened.
 */
export const listDriveFolder = async ({
  drive,
  folderId,
  limit,
}: {
  drive: drive_v3.Drive;
  folderId: string;
  limit: number;
}): Promise<SourceListing> => {
  const documents: SourceDocument[] = [];
  let ignored = 0;
  let truncated = false;
  let pageToken: string | undefined;

  do {
    const page = await drive.files.list({
      // The id is checked by the caller: letters, digits, "-" and "_" only
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id,name,mimeType,size,webViewLink,modifiedTime,md5Checksum)",
      orderBy: "modifiedTime desc",
      pageSize: 100,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    for (const file of page.data.files ?? []) {
      if (!file.id) continue;

      if (file.mimeType === FOLDER_MIME_TYPE) {
        ignored++;
        continue;
      }

      if (documents.length >= limit) {
        truncated = true;
        break;
      }

      documents.push({
        id: file.id,
        title: file.name || "Untitled",
        url: file.webViewLink ?? null,
        // The checksum too: a file replaced within the same second
        version: [file.modifiedTime, file.md5Checksum].filter(Boolean).join(" ") || null,
        mimeType: file.mimeType ?? "",
        size: file.size ? Number(file.size) : null,
      });
    }

    pageToken = page.data.nextPageToken ?? undefined;
  } while (pageToken && !truncated);

  return { documents, truncated, ignored };
};

const exportDriveFile = async (drive: drive_v3.Drive, fileId: string, mimeType: string) => {
  const exported = await drive.files.export(
    { fileId, mimeType },
    { responseType: "arraybuffer" }
  );

  return Buffer.from(exported.data as ArrayBuffer).toString("utf8");
};

/**
 * The text of one Drive file. Google's own documents are exported; PDFs and
 * Word files are read like the Extract from File node reads them.
 */
export const readDriveDocument = async (
  drive: drive_v3.Drive,
  document: SourceDocument
): Promise<DocumentText> => {
  const mimeType = document.mimeType ?? "";
  const kind = classifyDriveFile(mimeType, document.title);

  if (!kind) {
    return { skip: `files of type ${mimeType || "unknown"} have no text the loader can read` };
  }

  if (kind === "google-doc") {
    try {
      // Markdown keeps the headings, for splitting by heading
      return {
        text: await exportDriveFile(drive, document.id, "text/markdown"),
        markdown: true,
      };
    } catch {
      return {
        text: await exportDriveFile(drive, document.id, "text/plain"),
        markdown: false,
      };
    }
  }

  if (kind === "google-sheet") {
    // The first sheet, as Drive exports it
    return { text: await exportDriveFile(drive, document.id, "text/csv"), markdown: false };
  }

  if (kind === "google-slides") {
    return { text: await exportDriveFile(drive, document.id, "text/plain"), markdown: false };
  }

  if (typeof document.size === "number" && document.size > MAX_FILE_BYTES) {
    return { skip: `the file is larger than ${megabytes(MAX_FILE_BYTES)}` };
  }

  const downloaded = await drive.files.get(
    { fileId: document.id, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" }
  );
  const bytes = Buffer.from(downloaded.data as ArrayBuffer);

  if (bytes.length > MAX_FILE_BYTES) {
    return { skip: `the file is larger than ${megabytes(MAX_FILE_BYTES)}` };
  }

  if (kind === "pdf") {
    const pdf = await extractPdfText(new Uint8Array(bytes));

    return pdf.text.trim()
      ? { text: pdf.text, markdown: false }
      : { skip: "the PDF has no text (it is probably scanned)" };
  }

  if (kind === "docx") {
    const docx = await extractDocxText(bytes);

    return { text: docx.text, markdown: false };
  }

  return {
    text: bytes.toString("utf8"),
    markdown: isMarkdownFile(mimeType, document.title),
  };
};

// =========================================================================
// NOTION
// =========================================================================
const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

// One page: how many blocks are read, and how deep nested blocks are followed
const NOTION_MAX_BLOCKS = 1000;
const NOTION_MAX_DEPTH = 3;

const notionHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Notion-Version": NOTION_VERSION,
});

/**
 * A database id from the id itself or from a link copied in Notion: 32 hex
 * digits, with or without dashes. Null for anything else.
 */
export const parseNotionId = (value: string): string | null => {
  const text = value.trim().split(/[?#]/)[0];
  const match =
    /([0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12})$/i.exec(text) ??
    /([0-9a-f]{32})/i.exec(text.replace(/-/g, ""));

  return match ? match[1].replace(/-/g, "").toLowerCase() : null;
};

const richText = (value: unknown): string =>
  (Array.isArray(value) ? value : [])
    .map((part) => (isRecord(part) && typeof part.plain_text === "string" ? part.plain_text : ""))
    .join("");

/**
 * One property of a database row as text, or "" for an empty one and for
 * kinds that say nothing about the content (files, relations, formulas'
 * internals).
 */
export const notionPropertyText = (property: unknown): string => {
  if (!isRecord(property)) return "";

  const value = property[String(property.type)];

  switch (property.type) {
    case "title":
    case "rich_text":
      return richText(value);
    case "number":
      return typeof value === "number" ? String(value) : "";
    case "select":
    case "status":
      return isRecord(value) && typeof value.name === "string" ? value.name : "";
    case "multi_select":
      return (Array.isArray(value) ? value : [])
        .map((option) => (isRecord(option) && typeof option.name === "string" ? option.name : ""))
        .filter(Boolean)
        .join(", ");
    case "date":
      return isRecord(value) && typeof value.start === "string"
        ? [value.start, value.end].filter((part) => typeof part === "string").join(" to ")
        : "";
    case "checkbox":
      return value === true ? "yes" : value === false ? "no" : "";
    case "url":
    case "email":
    case "phone_number":
      return typeof value === "string" ? value : "";
    case "people":
      return (Array.isArray(value) ? value : [])
        .map((person) => (isRecord(person) && typeof person.name === "string" ? person.name : ""))
        .filter(Boolean)
        .join(", ");
    default:
      return "";
  }
};

/**
 * A database row's title, and its other filled-in properties as
 * "Name: value" lines.
 */
export const readNotionProperties = (properties: unknown) => {
  let title = "";
  const lines: string[] = [];

  for (const [name, property] of Object.entries(isRecord(properties) ? properties : {})) {
    const text = notionPropertyText(property).trim();
    if (!text) continue;

    if (isRecord(property) && property.type === "title") title = text;
    else lines.push(`${name}: ${text}`);
  }

  return { title, text: lines.join("\n") };
};

export const listNotionDatabase = async ({
  token,
  databaseId,
  limit,
}: {
  token: string;
  databaseId: string;
  limit: number;
}): Promise<SourceListing> => {
  const documents: SourceDocument[] = [];
  let truncated = false;
  let cursor: string | undefined;

  do {
    const page = await ky
      .post(`${NOTION_API}/databases/${databaseId}/query`, {
        headers: notionHeaders(token),
        json: {
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
          sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
        },
        timeout: 30_000,
      })
      .json<{ results?: unknown[]; has_more?: boolean; next_cursor?: string | null }>();

    for (const row of page.results ?? []) {
      if (!isRecord(row) || typeof row.id !== "string" || row.archived === true || row.in_trash === true) {
        continue;
      }

      if (documents.length >= limit) {
        truncated = true;
        break;
      }

      const { title, text } = readNotionProperties(row.properties);

      documents.push({
        id: row.id.replace(/-/g, ""),
        title: title || "Untitled",
        url: typeof row.url === "string" ? row.url : null,
        version: typeof row.last_edited_time === "string" ? row.last_edited_time : null,
        properties: text,
      });
    }

    cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined;
  } while (cursor && !truncated);

  return { documents, truncated, ignored: 0 };
};

type NotionBlock = Record<string, unknown> & { children?: NotionBlock[] };

/**
 * Notion blocks as Markdown: headings stay headings, so a page can be split
 * by them. Kinds without text (images, files, dividers) are left out.
 */
export const notionBlocksToMarkdown = (blocks: NotionBlock[], indent = ""): string => {
  const lines: string[] = [];

  for (const block of blocks) {
    const type = String(block.type ?? "");
    const body = isRecord(block[type]) ? (block[type] as Record<string, unknown>) : {};
    const text = richText(body.rich_text);
    const children = block.children?.length ? block.children : null;
    // Nested list entries are indented; everything else follows on
    let childIndent = indent;

    switch (type) {
      case "heading_1":
        if (text) lines.push(`# ${text}`, "");
        break;
      case "heading_2":
        if (text) lines.push(`## ${text}`, "");
        break;
      case "heading_3":
        if (text) lines.push(`### ${text}`, "");
        break;
      case "bulleted_list_item":
        lines.push(`${indent}- ${text}`);
        childIndent = `${indent}  `;
        break;
      case "numbered_list_item":
        lines.push(`${indent}1. ${text}`);
        childIndent = `${indent}  `;
        break;
      case "to_do":
        lines.push(`${indent}- [${body.checked === true ? "x" : " "}] ${text}`);
        childIndent = `${indent}  `;
        break;
      case "quote":
        if (text) lines.push(`> ${text}`, "");
        break;
      case "code":
        if (text) lines.push("```", text, "```", "");
        break;
      case "equation":
        if (typeof body.expression === "string") lines.push(body.expression, "");
        break;
      case "child_page":
      case "child_database":
        if (typeof body.title === "string" && body.title) lines.push(body.title, "");
        break;
      case "table_row":
        lines.push(
          (Array.isArray(body.cells) ? body.cells : []).map((cell) => richText(cell)).join(" | ")
        );
        break;
      case "bookmark":
      case "embed":
      case "link_preview":
        if (typeof body.url === "string") lines.push(body.url, "");
        break;
      default:
        // paragraph, callout, toggle and anything else that carries text
        if (text) lines.push(`${indent}${text}`, "");
    }

    if (children) {
      const nested = notionBlocksToMarkdown(children, childIndent);
      if (nested) lines.push(nested);
      // What is inside a toggle or a callout ends like a paragraph
      if (nested && childIndent === indent) lines.push("");
    }
  }

  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+$/, "");
};

const fetchNotionBlocks = async (
  token: string,
  blockId: string,
  depth: number,
  budget: { left: number }
): Promise<NotionBlock[]> => {
  const blocks: NotionBlock[] = [];
  let cursor: string | undefined;

  do {
    const page = await ky
      .get(`${NOTION_API}/blocks/${blockId}/children`, {
        headers: notionHeaders(token),
        searchParams: { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) },
        timeout: 30_000,
      })
      .json<{ results?: unknown[]; has_more?: boolean; next_cursor?: string | null }>();

    for (const entry of page.results ?? []) {
      if (!isRecord(entry) || budget.left <= 0) continue;

      budget.left--;
      const block: NotionBlock = entry;

      // A page inside the page is its own document, not part of this one
      if (
        block.has_children === true &&
        depth < NOTION_MAX_DEPTH &&
        block.type !== "child_page" &&
        block.type !== "child_database" &&
        typeof block.id === "string"
      ) {
        block.children = await fetchNotionBlocks(token, block.id, depth + 1, budget);
      }

      blocks.push(block);
    }

    cursor = page.has_more && page.next_cursor && budget.left > 0 ? page.next_cursor : undefined;
  } while (cursor);

  return blocks;
};

/**
 * A database row as text: its title, its properties, and the page's
 * content as Markdown.
 */
export const readNotionDocument = async (
  token: string,
  document: SourceDocument
): Promise<DocumentText> => {
  const blocks = await fetchNotionBlocks(token, document.id, 1, { left: NOTION_MAX_BLOCKS });
  const content = notionBlocksToMarkdown(blocks);

  const text = [`# ${document.title}`, document.properties, content]
    .filter((part) => part && part.trim())
    .join("\n\n");

  return content || document.properties
    ? { text, markdown: true }
    : { skip: "the page is empty" };
};
