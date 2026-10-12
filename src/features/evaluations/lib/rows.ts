// Rows pasted into a dataset as JSON. No server imports: the dialog reads
// the text before it is sent.

import { EVAL_MAX_ROWS, EVAL_MAX_TEXT_CHARS } from "./scoring";

export type PastedRow = { input: string; expected: string };

// A text as it is; an object, a list or a number as JSON
const asText = (value: unknown): string =>
  value === undefined || value === null
    ? ""
    : typeof value === "string"
      ? value
      : JSON.stringify(value);

/**
 * `[{ "input": ..., "expected": ... }]` as rows, or what is wrong with it.
 * `output` and `criteria` are read as `expected` too.
 */
export const parsePastedRows = (
  text: string
): { ok: true; rows: PastedRow[] } | { ok: false; error: string } => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "This is not JSON. Paste a list like [{ \"input\": \"...\", \"expected\": \"...\" }]." };
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { ok: false, error: "Paste a JSON list with at least one row." };
  }

  if (parsed.length > EVAL_MAX_ROWS) {
    return { ok: false, error: `A dataset can have ${EVAL_MAX_ROWS} rows; this list has ${parsed.length}.` };
  }

  const rows: PastedRow[] = [];

  for (const [index, entry] of parsed.entries()) {
    const fields =
      entry !== null && typeof entry === "object" && !Array.isArray(entry)
        ? (entry as Record<string, unknown>)
        : null;

    const input = asText(fields?.input);

    if (!fields || !input.trim()) {
      return { ok: false, error: `Row ${index + 1} has no "input".` };
    }

    const expected = asText(fields.expected ?? fields.output ?? fields.criteria);

    if (input.length > EVAL_MAX_TEXT_CHARS || expected.length > EVAL_MAX_TEXT_CHARS) {
      return { ok: false, error: `Row ${index + 1} is longer than ${EVAL_MAX_TEXT_CHARS} characters.` };
    }

    rows.push({ input, expected });
  }

  return { ok: true, rows };
};
