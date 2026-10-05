import { NonRetriableError } from "inngest";

/**
 * Reads a list of name/value pairs typed into a textarea. Accepts a JSON
 * object, or one pair per line written as `Name: value` or `name=value`.
 */
export const parseKeyValues = (
  label: string,
  fieldName: string,
  text: string | undefined
): Record<string, string> => {
  const trimmed = (text || "").trim();
  if (!trimmed) return {};

  if (trimmed.startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new NonRetriableError(
        `${label} node: Invalid JSON in the ${fieldName} field`
      );
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new NonRetriableError(
        `${label} node: ${fieldName} must be a JSON object`
      );
    }

    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => [
          key,
          typeof value === "object" ? JSON.stringify(value) : String(value),
        ])
    );
  }

  const result: Record<string, string> = {};

  for (const line of trimmed.split(/\r?\n/)) {
    if (!line.trim()) continue;

    const separator = line.search(/[:=]/);
    const key = separator > 0 ? line.slice(0, separator).trim() : "";

    if (!key) {
      throw new NonRetriableError(
        `${label} node: could not read "${line.trim()}" in the ${fieldName} field. Write one "Name: value" per line.`
      );
    }

    result[key] = line.slice(separator + 1).trim();
  }

  return result;
};
