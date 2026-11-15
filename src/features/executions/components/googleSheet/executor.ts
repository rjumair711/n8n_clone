import { NodeExecutor } from "../../types";
import { renderEscapedTemplate, renderTemplate } from "@/features/executions/lib/templates";
import { NonRetriableError } from "inngest";
import { google } from "googleapis";
import prisma from "@/lib/db";
import { getGoogleAuth } from "@/lib/google-oauth";
import {
  applyWrites,
  buildRowArray,
  capRows,
  columnLetter,
  matchRows,
  normalizeSheetsOperation,
  parseColumnValueLines,
  quoteSheetName,
  readHeaders,
  resolveCellWrites,
  SHEETS_OPERATION_LABELS,
  valuesToRows,
} from "./rows";

type GoogleSheetsData = {
  operation?: string;
  credentialId?: string;
  sheetId?: string;
  sheetName?: string;
  // Append Row
  rowData?: string;
  // Get Rows (optional filter), Lookup, Update and Upsert
  matchColumn?: string;
  matchValue?: string;
  // Update and Upsert: "Column: value" lines
  columnValues?: string;
  variableName?: string;
};

export const googleSheetsExecutor: NodeExecutor<GoogleSheetsData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
}) => {
  const operation = normalizeSheetsOperation(data.operation);
  const label = `Google Sheets (${SHEETS_OPERATION_LABELS[operation]})`;
  const fail = (message: string) => new NonRetriableError(`${label}: ${message}`);

  if (!data.credentialId) throw fail("Credential ID is required");
  if (!data.sheetId) throw fail("Spreadsheet ID is required");
  if (!data.variableName) throw fail("Variable name is required");
  if (operation === "append" && !data.rowData) throw fail("Row data is required");

  const needsMatch = operation === "lookup" || operation === "update" || operation === "upsert";
  if (needsMatch && !data.matchColumn?.trim()) throw fail("Column to Match On is required");
  if ((operation === "update" || operation === "upsert") && !data.columnValues?.trim()) {
    throw fail("Values to Set are required (one \"Column: value\" per line)");
  }

  const credential = await step.run("get-sheets-credential", async () =>
    prisma.credential.findUnique({ where: { id: data.credentialId, userId } }),
  );
  if (!credential) throw fail("Credential not found");

  const sheetName = data.sheetName || "Sheet1";

  const sheetsClient = async () => {
    // A Google account (OAuth) or a service account
    const auth = await getGoogleAuth("Google Sheets", credential, [
      "https://www.googleapis.com/auth/spreadsheets",
    ]);
    return google.sheets({ version: "v4", auth });
  };

  // ---------------------------------------------------------------- append
  // Unchanged from before the other operations existed: comma-separated
  // values, rendered the way this node always has
  if (operation === "append") {
    const rowValues = renderEscapedTemplate(data.rowData, context)
      .split(",")
      .map((value: string) => value.trim());

    try {
      const result = await step.run("append-row-to-sheet", async () => {
        const sheets = await sheetsClient();
        const response = await sheets.spreadsheets.values.append({
          spreadsheetId: data.sheetId,
          range: `${sheetName}!A1`,
          valueInputOption: "USER_ENTERED",
          insertDataOption: "INSERT_ROWS",
          requestBody: { values: [rowValues] },
        });
        return {
          updatedRange: response.data.updates?.updatedRange,
          updatedRows: response.data.updates?.updatedRows,
          updatedCells: response.data.updates?.updatedCells,
        };
      });
      return { ...context, [data.variableName]: result };
    } catch (error: any) {
      throw new NonRetriableError(`Google Sheets node failed: ${error.message}`);
    }
  }

  // ------------------------------------------------- read, then maybe write
  const matchColumn = (data.matchColumn ?? "").trim();
  const matchValue = renderTemplate(data.matchValue, context);

  // Split the lines first, then render each value, so data with a colon or
  // a line break in it cannot move a value to another column
  let pairs: { column: string; value: string }[] = [];
  if (operation === "update" || operation === "upsert") {
    try {
      pairs = parseColumnValueLines(data.columnValues).map(({ column, template }) => ({
        column,
        value: renderTemplate(template, context),
      }));
    } catch (error: any) {
      throw fail(error.message);
    }
  }

  const quoted = quoteSheetName(sheetName);

  try {
    const result = await step.run(`sheets-${nodeId}-${operation}`, async () => {
      const sheets = await sheetsClient();
      const read = await sheets.spreadsheets.values.get({
        spreadsheetId: data.sheetId,
        range: quoted,
        valueRenderOption: "FORMATTED_VALUE",
      });
      const values = (read.data.values ?? []) as unknown[][];
      const headers = readHeaders(values);
      const rows = valuesToRows(values);

      if (operation === "get_rows") {
        const picked = matchColumn ? matchRows(rows, headers, matchColumn, matchValue) : rows;
        const capped = capRows(picked);
        return {
          rows: capped.rows,
          count: capped.rows.length,
          ...(capped.truncated
            ? { truncated: true, warning: `Only the first ${capped.rows.length} of ${picked.length} rows were returned: more would be too large to store (3 MB). Filter with Column to Match On.` }
            : {}),
        };
      }

      const matches = matchRows(rows, headers, matchColumn, matchValue);
      const first = matches[0];

      if (operation === "lookup") {
        return { found: !!first, row: first ?? null, rowNumber: first?.row_number ?? null, matches: matches.length };
      }

      const writes = resolveCellWrites(headers, pairs);

      if (first) {
        // Update the first matching row, cell by cell, so other columns and
        // their formulas stay as they are
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: data.sheetId,
          requestBody: {
            valueInputOption: "USER_ENTERED",
            data: writes.map((write) => ({
              range: `${quoted}!${columnLetter(write.index)}${first.row_number}`,
              values: [[write.value]],
            })),
          },
        });
        return {
          action: "updated",
          found: true,
          updated: true,
          rowNumber: first.row_number,
          row: applyWrites(first, writes),
          matches: matches.length,
        };
      }

      if (operation === "update") {
        return { action: "none", found: false, updated: false, rowNumber: null, row: null, matches: 0 };
      }

      // Upsert with no match: a new row, with the match value in its column
      const matchWrite = resolveCellWrites(headers, [{ column: matchColumn, value: matchValue }]);
      const all = [...matchWrite.filter((write) => !writes.some((w) => w.index === write.index)), ...writes];
      const appended = await sheets.spreadsheets.values.append({
        spreadsheetId: data.sheetId,
        range: `${quoted}!A1`,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [buildRowArray(headers, all)] },
      });
      const range = appended.data.updates?.updatedRange ?? "";
      const rowNumber = Number(/(\d+)(?::[A-Z]+\d+)?$/.exec(range)?.[1]) || null;
      const row: Record<string, string | number | null> = { row_number: rowNumber };
      for (const header of headers) row[header] = "";
      for (const write of all) row[write.column] = write.value;
      return { action: "appended", found: false, updated: false, rowNumber, row, matches: 0 };
    });

    return { ...context, [data.variableName]: result };
  } catch (error: any) {
    throw fail(error.message);
  }
};
