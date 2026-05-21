import { googleSheetsChannel } from "@/inngest/channels/googleSheet";
import { NodeExecutor } from "../../types";
import { NonRetriableError } from "inngest";
import { google } from "googleapis";
import Handlebars from "handlebars";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";

type GoogleSheetsData = {
  credentialId?: string;
  sheetId?: string;
  sheetName?: string;
  rowData?: string;
  variableName?: string;
};

export const googleSheetsExecutor: NodeExecutor<GoogleSheetsData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
  publish,
}) => {
  await publish(
    googleSheetsChannel().status({ nodeId, status: "loading", message: "Appending row..." })
  );

  // Validation
  if (!data.credentialId) {
    await publish(googleSheetsChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Google Sheets node: Credential ID is required");
  }
  if (!data.sheetId) {
    await publish(googleSheetsChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Google Sheets node: Spreadsheet ID is required");
  }
  if (!data.rowData) {
    await publish(googleSheetsChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Google Sheets node: Row data is required");
  }
  if (!data.variableName) {
    await publish(googleSheetsChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Google Sheets node: Variable name is required");
  }

  // Fetch and decrypt credential
  const credential = await step.run("get-sheets-credential", () =>
    prisma.credential.findUnique({
      where: { id: data.credentialId, userId },
    })
  );

  if (!credential) {
    await publish(googleSheetsChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Google Sheets node: Credential not found");
  }

  let serviceAccount: { clientEmail: string; privateKey: string; projectId: string };
  try {
    serviceAccount = JSON.parse(decrypt(credential.value));
  } catch {
    await publish(googleSheetsChannel().status({ nodeId, status: "error" }));
    throw new NonRetriableError("Google Sheets node: Invalid credential format");
  }

  // Resolve Handlebars variables in rowData
  const resolvedRowData = Handlebars.compile(data.rowData)(context);

  // Split comma-separated values into array and trim whitespace
  const rowValues = resolvedRowData.split(",").map((v: string) => v.trim());

  const sheetName = data.sheetName || "Sheet1";
  const range = `${sheetName}!A1`;

  try {
    const result = await step.run("append-row-to-sheet", async () => {
      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: serviceAccount.clientEmail,
          // Private keys from JSON files have literal \n — replace them
          private_key: serviceAccount.privateKey.replace(/\\n/g, "\n"),
          project_id: serviceAccount.projectId,
        },
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });

      const sheets = google.sheets({ version: "v4", auth });

      const response = await sheets.spreadsheets.values.append({
        spreadsheetId: data.sheetId,
        range,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
          values: [rowValues],
        },
      });

      return {
        updatedRange: response.data.updates?.updatedRange,
        updatedRows: response.data.updates?.updatedRows,
        updatedCells: response.data.updates?.updatedCells,
      };
    });

    await publish(googleSheetsChannel().status({ nodeId, status: "success" }));

    return {
      ...context,
      [data.variableName]: result,
    };

  } catch (error: any) {
    await publish(
      googleSheetsChannel().status({ nodeId, status: "error", message: error.message })
    );
    throw error;
  }
};