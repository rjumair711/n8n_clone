// The parts of the Google Sheets node that need no network: reading a sheet
// as rows with named columns, finding a row, and turning "Column: value"
// lines into the cells to write. Like n8n, row 1 holds the column names and
// every row carries its `row_number` (the number shown in Google Sheets).

export const SHEETS_OPERATIONS = ["append", "get_rows", "lookup", "update", "upsert"] as const;
export type SheetsOperation = (typeof SHEETS_OPERATIONS)[number];

export const SHEETS_OPERATION_LABELS: Record<SheetsOperation, string> = {
  append: "Append Row",
  get_rows: "Get Rows",
  lookup: "Lookup Row",
  update: "Update Row",
  upsert: "Append or Update Row",
};

// Nodes saved before there was a choice only appended
export const normalizeSheetsOperation = (value: unknown): SheetsOperation =>
  SHEETS_OPERATIONS.find((operation) => operation === value) ?? "append";

export type SheetRow = Record<string, string | number> & { row_number: number };

/** A (1) ... Z (26), AA (27) ... */
export const columnLetter = (index: number): string => {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rest = (n - 1) % 26;
    letters = String.fromCharCode(65 + rest) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
};

/** A tab name in A1 notation, quoted so spaces and symbols work: 'My Sheet' */
export const quoteSheetName = (name: string): string => `'${name.replace(/'/g, "''")}'`;

const cellText = (value: unknown): string => (value === null || value === undefined ? "" : String(value));

/**
 * The column names from row 1. A blank heading is named after its column
 * letter, and a repeated one gets _2, _3, so that no value is lost.
 */
export const readHeaders = (values: unknown[][]): string[] => {
  const seen = new Map<string, number>();
  return (values[0] ?? []).map((raw, index) => {
    const base = cellText(raw).trim() || columnLetter(index);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
  });
};

/** Every row under the headings, skipping rows with nothing in them. */
export const valuesToRows = (values: unknown[][]): SheetRow[] => {
  const headers = readHeaders(values);
  const rows: SheetRow[] = [];

  values.slice(1).forEach((cells, offset) => {
    if (!cells.some((cell) => cellText(cell).trim() !== "")) return;
    const row = { row_number: offset + 2 } as SheetRow;
    headers.forEach((header, index) => {
      row[header] = cellText(cells[index]);
    });
    rows.push(row);
  });

  return rows;
};

/** The index of a column by its name, ignoring case and outer spaces. */
export const findColumn = (headers: string[], name: string): number => {
  const wanted = name.trim().toLowerCase();
  return headers.findIndex((header) => header.trim().toLowerCase() === wanted);
};

const unknownColumn = (headers: string[], name: string) =>
  new Error(
    `The sheet has no column "${name}". Row 1 has: ${headers.length ? headers.join(", ") : "nothing (add column names in row 1)"}`,
  );

/** Rows whose value in the column equals the value (both trimmed). */
export const matchRows = (rows: SheetRow[], headers: string[], column: string, value: string): SheetRow[] => {
  const index = findColumn(headers, column);
  if (index === -1) throw unknownColumn(headers, column);
  const header = headers[index];
  const wanted = value.trim();
  return rows.filter((row) => cellText(row[header]).trim() === wanted);
};

/**
 * "Column: value" lines into pairs, before the values are rendered, so a
 * value that contains a colon or a line break from the data stays whole.
 * Blank lines are skipped; a line without a colon is an error.
 */
export const parseColumnValueLines = (text: string | undefined): { column: string; template: string }[] =>
  (text ?? "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const colon = line.indexOf(":");
      if (colon <= 0) {
        throw new Error(`"${line.trim()}" is not "Column: value". Write one column per line, for example Status: Paid`);
      }
      return { column: line.slice(0, colon).trim(), template: line.slice(colon + 1).trim() };
    });

export type CellWrite = { column: string; index: number; value: string };

/** Which column each value goes to; every column must exist in row 1. */
export const resolveCellWrites = (
  headers: string[],
  pairs: { column: string; value: string }[],
): CellWrite[] =>
  pairs.map(({ column, value }) => {
    const index = findColumn(headers, column);
    if (index === -1) throw unknownColumn(headers, column);
    return { column: headers[index], index, value };
  });

/** A new row with the values in their columns and the rest empty. */
export const buildRowArray = (headers: string[], writes: CellWrite[]): string[] => {
  const width = Math.max(headers.length, ...writes.map((write) => write.index + 1));
  const row = new Array<string>(width).fill("");
  for (const write of writes) row[write.index] = write.value;
  return row;
};

/** A row as an object after the writes (what the node outputs). */
export const applyWrites = (row: SheetRow, writes: CellWrite[]): SheetRow => {
  const next = { ...row };
  for (const write of writes) next[write.column] = write.value;
  return next;
};

/**
 * The rows that fit in a step's stored output; Inngest keeps a few MB per
 * step, so a large sheet is cut short and says so.
 */
export const capRows = (rows: SheetRow[], maxBytes = 3 * 1024 * 1024): { rows: SheetRow[]; truncated: boolean } => {
  let bytes = 2;
  for (let index = 0; index < rows.length; index++) {
    bytes += JSON.stringify(rows[index]).length + 1;
    if (bytes > maxBytes) return { rows: rows.slice(0, index), truncated: true };
  }
  return { rows, truncated: false };
};
