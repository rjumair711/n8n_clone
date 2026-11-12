// The Google Sheets node's Row Values: from the template the user typed to
// the cells of the new row. No server-only imports, so the tests run it.
//
// - The template is split into columns at its own commas, before the
//   {{variables}} are filled in, so a value with a comma in it (a message,
//   an address, "Smith, John") stays in its cell.
// - A template with no comma of its own ("{{line}}") is split after it is
//   filled in, as it always was, so a variable holding "a, b, c" still
//   spreads over three columns.
// - Values are not HTML-escaped: O'Brien & Sons arrives as typed.
// - The row is sent as USER_ENTERED (dates and numbers are recognised), so a
//   value from a variable that would start a formula (=, +, -, @) is kept
//   as text. A formula typed in the template itself still works.

import type { WorkflowContext } from "../../types";
import { renderTemplate } from "../../lib/templates";

/**
 * The template's columns: split at commas that are not inside {{ }}.
 */
export const splitRowTemplate = (template: string): string[] => {
  const columns: string[] = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < template.length; index++) {
    if (template.startsWith("{{", index)) {
      depth++;
      index++;
    } else if (depth > 0 && template.startsWith("}}", index)) {
      depth--;
      index++;
    } else if (depth === 0 && template[index] === ",") {
      columns.push(template.slice(start, index));
      start = index + 1;
    }
  }

  columns.push(template.slice(start));

  return columns.map((column) => column.trim());
};

const PLAIN_NUMBER = /^[+-]?\d+(?:\.\d+)?$/;
const FORMULA_START = /^[=+\-@]/;

/**
 * A value Google Sheets would read as a formula is kept as text: a leading
 * apostrophe, which Sheets does not show. Plain numbers (-500, +923001234567)
 * are left as they are.
 */
export const protectCell = (value: string): string =>
  FORMULA_START.test(value) && !PLAIN_NUMBER.test(value) ? `'${value}` : value;

const isAuthorFormula = (template: string) => template.trimStart().startsWith("=");

export const buildSheetRow = (template: string, context: WorkflowContext): string[] => {
  const columns = splitRowTemplate(template);

  if (columns.length === 1) {
    const cells = renderTemplate(template, context)
      .split(",")
      .map((value) => value.trim());

    // One cell typed as a formula, for example =TODAY()
    if (cells.length === 1 && isAuthorFormula(template)) return cells;

    return cells.map(protectCell);
  }

  return columns.map((column) => {
    const value = renderTemplate(column, context).trim();

    return isAuthorFormula(column) ? value : protectCell(value);
  });
};
