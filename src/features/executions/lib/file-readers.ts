// Readers and writers for document formats (PDF, Word, Excel). Their
// libraries are large, so each is loaded only when a workflow needs it.

const MAX_SHEET_ROWS = 5000;
const MAX_TEXT_CHARACTERS = 500_000;

const clip = (text: string) =>
  text.length > MAX_TEXT_CHARACTERS
    ? { text: text.slice(0, MAX_TEXT_CHARACTERS), truncated: true }
    : { text, truncated: false };

/**
 * The text of a PDF. Scanned documents are images and have no text to read.
 */
export const extractPdfText = async (data: Uint8Array) => {
  const { extractText, getDocumentProxy } = await import("unpdf");

  // The parser takes ownership of the bytes it is given
  const document = await getDocumentProxy(new Uint8Array(data));
  const result = await extractText(document, { mergePages: false });

  const pages = (result.text as string[]).map((page) => page.trim());

  return {
    ...clip(pages.join("\n\n").trim()),
    pages: result.totalPages,
    pageTexts: pages.slice(0, 200),
  };
};

/**
 * The text of a Word .docx document, one paragraph per line.
 */
export const extractDocxText = async (data: Buffer) => {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: data });

  return clip(result.value.trim());
};

// A cell can hold a formula, rich text, a link or a date, not just a value
const readCell = (value: unknown): unknown => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return value;

  const cell = value as Record<string, unknown>;

  if ("result" in cell) return readCell(cell.result);
  if (Array.isArray(cell.richText)) {
    return cell.richText.map((part: { text?: string }) => part.text ?? "").join("");
  }
  if ("text" in cell) return readCell(cell.text);
  if ("error" in cell) return String(cell.error);

  return "";
};

/**
 * The rows of one sheet of an Excel .xlsx workbook, as objects keyed by the
 * header row (or column1, column2... without one).
 */
export const readXlsx = async (
  data: Buffer,
  { sheet, header = true }: { sheet?: string; header?: boolean } = {}
) => {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();

  await workbook.xlsx.load(data as unknown as ArrayBuffer);

  const sheetNames = workbook.worksheets.map((worksheet) => worksheet.name);
  const worksheet = sheet
    ? workbook.getWorksheet(sheet)
    : workbook.worksheets[0];

  if (!worksheet) {
    throw new Error(
      sheet
        ? `The workbook has no sheet named "${sheet}". Its sheets are: ${sheetNames.join(", ")}`
        : "The workbook has no sheets"
    );
  }

  const rows: unknown[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    if (rows.length > MAX_SHEET_ROWS) return;

    // exceljs numbers cells from 1; index 0 is unused
    const values = (row.values as unknown[]).slice(1).map(readCell);
    if (values.some((value) => value !== "")) rows.push(values);
  });

  const truncated = rows.length > MAX_SHEET_ROWS;
  const kept = truncated ? rows.slice(0, MAX_SHEET_ROWS) : rows;

  if (kept.length === 0) {
    return { items: [], sheet: worksheet.name, sheetNames, truncated: false };
  }

  const width = Math.max(...kept.map((row) => row.length));

  const columns = header
    ? Array.from({ length: width }, (_, index) => {
        const name = String(kept[0][index] ?? "").trim();
        return name || `column${index + 1}`;
      })
    : Array.from({ length: width }, (_, index) => `column${index + 1}`);

  const items = (header ? kept.slice(1) : kept).map((row) =>
    Object.fromEntries(columns.map((column, index) => [column, row[index] ?? ""]))
  );

  return { items, sheet: worksheet.name, sheetNames, truncated };
};

/**
 * Writes a list of objects as an Excel workbook with one sheet. The columns
 * are every key that appears, in the order first seen.
 */
export const writeXlsx = async (rows: unknown[], sheetName = "Sheet1") => {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();

  // Excel does not allow these in a sheet name, nor more than 31 characters
  const worksheet = workbook.addWorksheet(
    sheetName.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || "Sheet1"
  );

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

  worksheet.columns = columns.map((column) => ({
    header: column,
    key: column,
    width: Math.min(Math.max(column.length + 2, 12), 40),
  }));
  worksheet.getRow(1).font = { bold: true };

  for (const record of records) {
    worksheet.addRow(
      Object.fromEntries(
        columns.map((column) => {
          const value = record[column];

          return [
            column,
            value !== null && typeof value === "object"
              ? JSON.stringify(value)
              : (value ?? ""),
          ];
        })
      )
    );
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
};
