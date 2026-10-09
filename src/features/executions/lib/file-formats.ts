// Text formats the file nodes read and write. Nothing here touches the
// database or the disk, so everything can be tested on its own.

// ============================================================================
// CSV
// ============================================================================

const csvCell = (value: unknown, delimiter: string): string => {
  if (value === undefined || value === null) return "";

  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);

  return text.includes(delimiter) || /["\r\n]/.test(text)
    ? `"${text.replace(/"/g, '""')}"`
    : text;
};

/**
 * Writes a list of objects as CSV. The columns are every key that appears,
 * in the order first seen; a list of plain values becomes one "value" column.
 */
export const toCsv = (rows: unknown[], delimiter = ","): string => {
  const records = rows.map((row) =>
    row !== null && typeof row === "object" && !Array.isArray(row)
      ? (row as Record<string, unknown>)
      : { value: row }
  );

  const columns: string[] = [];
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (!columns.includes(key)) columns.push(key);
    }
  }

  return [
    columns.map((column) => csvCell(column, delimiter)).join(delimiter),
    ...records.map((record) =>
      columns.map((column) => csvCell(record[column], delimiter)).join(delimiter)
    ),
  ].join("\r\n");
};

/**
 * Reads CSV into rows of cells. Handles quoted cells with commas, line
 * breaks and doubled quotes. With `maxRows`, reading stops once that many
 * rows (blank lines not counted) have been read.
 */
export const parseCsvRows = (
  text: string,
  delimiter = ",",
  maxRows = Number.POSITIVE_INFINITY
): string[][] => {
  const rows: string[][] = [];
  // Rows that are not blank: only those count towards the limit
  let kept = 0;
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  // A byte order mark from Excel is not part of the first header
  const input = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < input.length; index++) {
    const char = input[index];

    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          cell += '"';
          index++;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"' && cell === "") {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[index + 1] === "\n") index++;
      row.push(cell);
      rows.push(row);
      if (row.some((value) => value.trim() !== "")) kept++;
      row = [];
      cell = "";

      // The rest of the file is not read at all
      if (kept >= maxRows) break;
    } else {
      cell += char;
    }
  }

  if (kept < maxRows && (cell !== "" || row.length > 0)) {
    row.push(cell);
    rows.push(row);
  }

  // Blank lines are not rows
  return rows.filter((cells) => cells.some((value) => value.trim() !== ""));
};

/**
 * Reads at most `maxRows` data rows of a CSV file (the header row does not
 * count) and says whether the file had more.
 */
export const parseCsvLimited = (
  text: string,
  {
    delimiter = ",",
    header = true,
    maxRows,
  }: { delimiter?: string; header?: boolean; maxRows: number }
): { items: Record<string, string>[]; truncated: boolean } => {
  const limit = Math.max(Math.floor(maxRows), 1);
  // One row more than asked for shows that the file goes on
  const rows = parseCsvRows(text, delimiter, limit + (header ? 2 : 1));
  const truncated = rows.length > limit + (header ? 1 : 0);

  return {
    items: csvRowsToObjects(truncated ? rows.slice(0, -1) : rows, header),
    truncated,
  };
};

const csvRowsToObjects = (
  rows: string[][],
  header: boolean
): Record<string, string>[] => {
  if (rows.length === 0) return [];

  const width = Math.max(...rows.map((row) => row.length));

  const columns = header
    ? rows[0].map((name, index) => name.trim() || `column${index + 1}`)
    : Array.from({ length: width }, (_, index) => `column${index + 1}`);

  return (header ? rows.slice(1) : rows).map((row) =>
    Object.fromEntries(columns.map((column, index) => [column, row[index] ?? ""]))
  );
};

/**
 * Reads CSV into objects keyed by the header row (or column1, column2...
 * when the file has no header).
 */
export const parseCsv = (
  text: string,
  { delimiter = ",", header = true }: { delimiter?: string; header?: boolean } = {}
): Record<string, string>[] =>
  csvRowsToObjects(parseCsvRows(text, delimiter), header);

// ============================================================================
// FILE NAMES AND TYPES
// ============================================================================

export const XLSX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const MIME_TYPES: Record<string, string> = {
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  html: "text/html",
  md: "text/markdown",
  xml: "application/xml",
  pdf: "application/pdf",
  xlsx: XLSX_MIME_TYPE,
  docx: DOCX_MIME_TYPE,
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

export const mimeTypeForName = (fileName: string, fallback = "text/plain") =>
  MIME_TYPES[fileName.split(".").pop()?.toLowerCase() ?? ""] ?? fallback;

const EXTENSIONS: Record<string, string> = {
  "text/plain": "txt",
  "text/csv": "csv",
  "application/json": "json",
  "text/html": "html",
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "application/zip": "zip",
  [XLSX_MIME_TYPE]: "xlsx",
  [DOCX_MIME_TYPE]: "docx",
};

export const extensionForMimeType = (mimeType: string) =>
  EXTENSIONS[mimeType.split(";")[0].trim().toLowerCase()] ?? "bin";

export const isTextMimeType = (mimeType: string) =>
  /^text\/|json|xml|csv|javascript|yaml|x-www-form-urlencoded/i.test(mimeType);
