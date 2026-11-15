// The Data Table node's rules, without the database: names, keys, row data
// and limits. No server-only imports: the node dialog uses it too.
//
// A data table is a named list of rows per account, each row found by its
// key: an email in an "already contacted" list, a phone number with an
// agent's state. Rows are JSON objects.

export const DATA_TABLE_OPERATIONS = [
  { value: "upsert_row", label: "Insert or Update Row" },
  { value: "get_row", label: "Get Row" },
  { value: "find_row", label: "Check Row Exists" },
  { value: "delete_row", label: "Delete Row" },
  { value: "list_rows", label: "List Rows" },
] as const;

export type DataTableOperation = (typeof DATA_TABLE_OPERATIONS)[number]["value"];

export const DATA_TABLE_LIMITS = {
  tablesPerAccount: 50,
  rowsPerTable: 10_000,
  rowBytes: 16 * 1024,
  keyLength: 500,
  nameLength: 100,
  listDefault: 100,
  listMax: 1000,
} as const;

export class DataTableError extends Error {}

export const isDataTableOperation = (value: unknown): value is DataTableOperation =>
  DATA_TABLE_OPERATIONS.some((operation) => operation.value === value);

/** "Contacted Leads " -> "Contacted Leads"; names compare as typed, trimmed. */
export const normalizeTableName = (raw: string): string => {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) throw new DataTableError("Table Name is required");
  if (name.length > DATA_TABLE_LIMITS.nameLength) {
    throw new DataTableError(`Table Name is longer than ${DATA_TABLE_LIMITS.nameLength} characters`);
  }
  return name;
};

/** Keys are compared exactly after trimming; emails are lower-cased. */
export const normalizeRowKey = (raw: string): string => {
  let key = raw.trim();
  if (!key) throw new DataTableError("Key is required");
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) key = key.toLowerCase();
  if (key.length > DATA_TABLE_LIMITS.keyLength) {
    throw new DataTableError(`Key is longer than ${DATA_TABLE_LIMITS.keyLength} characters`);
  }
  return key;
};

/** The Row Data field: a JSON object, or nothing for a row with only a key. */
export const parseRowData = (raw: string): Record<string, unknown> => {
  const text = raw.trim();
  if (!text) return {};
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new DataTableError('Row Data must be a JSON object, for example {"status": "contacted"}');
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DataTableError('Row Data must be a JSON object, for example {"status": "contacted"}');
  }
  return value as Record<string, unknown>;
};

/** An update keeps the fields it does not name, like a partial save. */
export const mergeRowData = (
  existing: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> => {
  const base = existing && typeof existing === "object" && !Array.isArray(existing) ? (existing as Record<string, unknown>) : {};
  const merged = { ...base, ...patch };
  const bytes = new TextEncoder().encode(JSON.stringify(merged)).length;
  if (bytes > DATA_TABLE_LIMITS.rowBytes) {
    throw new DataTableError(`A row can hold at most ${DATA_TABLE_LIMITS.rowBytes / 1024} KB; this one would be ${Math.ceil(bytes / 1024)} KB`);
  }
  return merged;
};

export const clampListLimit = (raw: string | undefined): number => {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return DATA_TABLE_LIMITS.listDefault;
  return Math.min(n, DATA_TABLE_LIMITS.listMax);
};
