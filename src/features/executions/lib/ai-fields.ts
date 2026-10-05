// How the AI nodes read the lists typed into their dialogs. No server-only
// imports: the Text Classifier's canvas node uses the categories too.

export type ClassifierCategory = {
  // The output handle on the canvas, and the value of matchedBranch
  id: string;
  name: string;
  description: string;
};

export const OTHER_CATEGORY_ID = "other";

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * One category per line: `name: what belongs in it`. The description is
 * optional.
 */
export const parseCategories = (text: string | undefined): ClassifierCategory[] => {
  const categories: ClassifierCategory[] = [];
  const taken = new Set<string>([OTHER_CATEGORY_ID]);

  for (const line of (text || "").split(/\r?\n/)) {
    if (!line.trim()) continue;

    const separator = line.indexOf(":");
    const name = (separator === -1 ? line : line.slice(0, separator)).trim();
    if (!name) continue;

    let id = `category-${slug(name) || categories.length + 1}`;
    while (taken.has(id)) id = `${id}-2`;
    taken.add(id);

    categories.push({
      id,
      name,
      description: separator === -1 ? "" : line.slice(separator + 1).trim(),
    });
  }

  return categories;
};

export type ExtractorAttribute = {
  name: string;
  type: "string" | "number" | "boolean" | "date" | "list";
  description: string;
};

const ATTRIBUTE_TYPES = ["string", "number", "boolean", "date", "list"];

/**
 * One attribute per line: `name (type): what it is`. Type and description
 * are optional; the type defaults to string.
 */
export const parseAttributes = (text: string | undefined): ExtractorAttribute[] => {
  const attributes: ExtractorAttribute[] = [];

  for (const line of (text || "").split(/\r?\n/)) {
    const match = line.match(/^\s*([^:(]+?)\s*(?:\(\s*(\w+)\s*\))?\s*(?::\s*(.*))?$/);
    if (!match || !match[1].trim()) continue;

    const type = (match[2] || "string").toLowerCase();

    attributes.push({
      name: match[1].trim(),
      type: (ATTRIBUTE_TYPES.includes(type)
        ? type
        : "string") as ExtractorAttribute["type"],
      description: (match[3] || "").trim(),
    });
  }

  return attributes;
};

/**
 * Finds the JSON value in a model's answer, which may be wrapped in a
 * ```json fence or have a sentence before or after it. Returns undefined
 * when there is none.
 */
export const extractJson = (text: string): unknown => {
  const trimmed = text.trim();

  const candidates = [
    trimmed,
    trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
  ];

  for (const [open, close] of [
    ["{", "}"],
    ["[", "]"],
  ]) {
    const start = trimmed.indexOf(open);
    const end = trimmed.lastIndexOf(close);
    if (start !== -1 && end > start) candidates.push(trimmed.slice(start, end + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next shape
    }
  }

  return undefined;
};

/**
 * Splits text into overlapping chunks for embedding, breaking at paragraph
 * or sentence ends where it can.
 */
export const splitText = (
  text: string,
  chunkSize: number,
  chunkOverlap: number
): string[] => {
  const size = Math.max(Math.floor(chunkSize) || 1000, 100);
  const overlap = Math.min(Math.max(Math.floor(chunkOverlap) || 0, 0), size - 50);
  const clean = text.replace(/\r\n/g, "\n").trim();

  if (!clean) return [];
  if (clean.length <= size) return [clean];

  const chunks: string[] = [];
  let start = 0;

  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);

    if (end < clean.length) {
      const window = clean.slice(start, end);
      // Break at the last paragraph, sentence or word end, as long as the
      // chunk stays at least half full
      const breakAt = Math.max(
        window.lastIndexOf("\n\n"),
        window.lastIndexOf(". "),
        window.lastIndexOf("\n"),
        window.lastIndexOf(" ")
      );

      if (breakAt > size / 2) end = start + breakAt + 1;
    }

    const chunk = clean.slice(start, end).trim();
    if (chunk) chunks.push(chunk);

    if (end >= clean.length) break;

    start = end - overlap;
  }

  return chunks;
};
