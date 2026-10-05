// The list operations behind Split Out, Aggregate, Sort, Limit, Remove
// Duplicates, Summarize and Merge. Pure functions: no server-only imports.

import { getValueByPath } from "./conditions";

export type ListItem = unknown;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

// Reads "address.city" from an item; an empty path means the item itself
export const readField = (item: ListItem, path: string): unknown => {
  const field = path.trim();
  if (!field) return item;

  return isRecord(item) ? getValueByPath(item, field) : undefined;
};

export const parseFieldList = (text: string | undefined): string[] =>
  (text || "")
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);

/**
 * Split Out: turns the list inside each item into separate items.
 * `{ order: 1, lines: [a, b] }` split on "lines" gives `a` and `b`; with
 * `includeOtherFields` it gives `{ order: 1, lines: a }` and `{ order: 1, lines: b }`.
 */
export const splitOut = (
  items: ListItem[],
  field: string,
  includeOtherFields = false
): ListItem[] => {
  const result: ListItem[] = [];
  const leaf = field.trim().split(".").pop() || "value";

  for (const item of items) {
    const value = readField(item, field);
    if (value === undefined || value === null) continue;

    const elements = Array.isArray(value) ? value : [value];

    for (const element of elements) {
      if (includeOtherFields && isRecord(item)) {
        const { [field.trim().split(".")[0]]: _removed, ...rest } = item;
        result.push({ ...rest, [leaf]: element });
      } else {
        result.push(element);
      }
    }
  }

  return result;
};

/**
 * Aggregate: the opposite of Split Out. Collects one field of every item
 * into a single list, or wraps all items in one object.
 */
export const aggregate = (
  items: ListItem[],
  mode: "field" | "all",
  field: string,
  outputField: string
): Record<string, unknown> => {
  if (mode === "all") {
    return { [outputField.trim() || "data"]: items };
  }

  const name = outputField.trim() || field.trim().split(".").pop() || "data";

  return {
    [name]: items
      .map((item) => readField(item, field))
      .filter((value) => value !== undefined),
  };
};

const compareValues = (a: unknown, b: unknown): number => {
  const aMissing = a === undefined || a === null || a === "";
  const bMissing = b === undefined || b === null || b === "";

  // Items without the field go last, whatever the direction
  if (aMissing || bMissing) return aMissing === bMissing ? 0 : aMissing ? 1 : -1;

  const aNumber = typeof a === "number" ? a : Number(a);
  const bNumber = typeof b === "number" ? b : Number(b);

  if (
    typeof a !== "boolean" &&
    typeof b !== "boolean" &&
    !Number.isNaN(aNumber) &&
    !Number.isNaN(bNumber)
  ) {
    return aNumber - bNumber;
  }

  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
};

export const sortItems = (
  items: ListItem[],
  field: string,
  order: "asc" | "desc"
): ListItem[] => {
  const direction = order === "desc" ? -1 : 1;

  return items
    .map((item, index) => ({ item, index, value: readField(item, field) }))
    .sort((a, b) => {
      const aMissing = a.value === undefined || a.value === null || a.value === "";
      const bMissing = b.value === undefined || b.value === null || b.value === "";

      const result =
        aMissing || bMissing
          ? compareValues(a.value, b.value)
          : compareValues(a.value, b.value) * direction;

      // Equal items keep their original order
      return result || a.index - b.index;
    })
    .map((entry) => entry.item);
};

export const limitItems = (
  items: ListItem[],
  maxItems: number,
  keep: "first" | "last"
): ListItem[] => {
  const count = Math.max(Math.floor(maxItems) || 0, 0);
  if (count === 0) return [];

  return keep === "last" ? items.slice(-count) : items.slice(0, count);
};

// Stable regardless of the order keys were written in
const fingerprint = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(fingerprint).join(",")}]`;

  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${fingerprint(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value) ?? "undefined";
};

/**
 * Remove Duplicates: keeps the first item of every group that has the same
 * values. With no fields, whole items are compared.
 */
export const removeDuplicates = (
  items: ListItem[],
  fields: string[]
): ListItem[] => {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key =
      fields.length === 0
        ? fingerprint(item)
        : fingerprint(fields.map((field) => readField(item, field)));

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
};

export const SUMMARIZE_AGGREGATIONS = [
  { value: "count", label: "Count" },
  { value: "countUnique", label: "Count Unique" },
  { value: "sum", label: "Sum" },
  { value: "average", label: "Average" },
  { value: "min", label: "Min" },
  { value: "max", label: "Max" },
  { value: "concatenate", label: "Concatenate" },
] as const;

export type SummarizeAggregation =
  (typeof SUMMARIZE_AGGREGATIONS)[number]["value"];

const summarizeValues = (
  values: unknown[],
  aggregation: SummarizeAggregation
): unknown => {
  const present = values.filter(
    (value) => value !== undefined && value !== null && value !== ""
  );
  const numbers = present.map(Number).filter((value) => !Number.isNaN(value));

  switch (aggregation) {
    case "count":
      return present.length;
    case "countUnique":
      return new Set(present.map(fingerprint)).size;
    case "sum":
      return numbers.reduce((total, value) => total + value, 0);
    case "average":
      return numbers.length
        ? numbers.reduce((total, value) => total + value, 0) / numbers.length
        : null;
    case "min":
      return numbers.length ? Math.min(...numbers) : null;
    case "max":
      return numbers.length ? Math.max(...numbers) : null;
    case "concatenate":
      return present.map(String).join(", ");
  }
};

/**
 * Summarize: like a pivot table. One result per group, named the way n8n
 * names them ("sum_amount", "count_id").
 */
export const summarize = (
  items: ListItem[],
  field: string,
  aggregation: SummarizeAggregation,
  groupBy: string[]
): Record<string, unknown>[] => {
  const outputName = `${aggregation}_${field.trim().replace(/\./g, "_") || "items"}`;

  const groups = new Map<
    string,
    { keys: Record<string, unknown>; values: unknown[] }
  >();

  for (const item of items) {
    const keys = Object.fromEntries(
      groupBy.map((name) => [name, readField(item, name)])
    );
    const id = fingerprint(keys);

    if (!groups.has(id)) groups.set(id, { keys, values: [] });

    // Counting without a field counts the items themselves
    groups.get(id)!.values.push(field.trim() ? readField(item, field) : true);
  }

  if (groups.size === 0 && groupBy.length === 0) {
    return [{ [outputName]: summarizeValues([], aggregation) }];
  }

  return [...groups.values()].map((group) => ({
    ...group.keys,
    [outputName]: summarizeValues(group.values, aggregation),
  }));
};

export const MERGE_COMBINE_MODES = [
  { value: "none", label: "Do not combine lists" },
  { value: "append", label: "Append: all items of both lists" },
  { value: "byKey", label: "Combine by matching field" },
  { value: "byPosition", label: "Combine by position" },
] as const;

export type MergeCombineMode = (typeof MERGE_COMBINE_MODES)[number]["value"];

// 42 and "42" are the same key: IDs often arrive as text from one API and
// as numbers from another
const keyId = (value: unknown): string =>
  typeof value === "object" ? fingerprint(value) : String(value);

const mergeTwo = (a: ListItem, b: ListItem): ListItem =>
  isRecord(a) && isRecord(b) ? { ...a, ...b } : (b ?? a);

/**
 * Merge's data modes. "byKey" keeps the items of both lists that share a
 * value (n8n's "Keep Matches"); fields of list B win on a name clash.
 */
export const combineLists = (
  listA: ListItem[],
  listB: ListItem[],
  mode: Exclude<MergeCombineMode, "none">,
  keyA = "",
  keyB = ""
): ListItem[] => {
  if (mode === "append") return [...listA, ...listB];

  if (mode === "byPosition") {
    const length = Math.min(listA.length, listB.length);

    return Array.from({ length }, (_, index) =>
      mergeTwo(listA[index], listB[index])
    );
  }

  const byKey = new Map<string, ListItem[]>();
  for (const item of listB) {
    const value = readField(item, keyB || keyA);
    if (value === undefined || value === null) continue;

    const id = keyId(value);
    byKey.set(id, [...(byKey.get(id) ?? []), item]);
  }

  const result: ListItem[] = [];
  for (const item of listA) {
    const value = readField(item, keyA);
    if (value === undefined || value === null) continue;

    for (const match of byKey.get(keyId(value)) ?? []) {
      result.push(mergeTwo(item, match));
    }
  }

  return result;
};
