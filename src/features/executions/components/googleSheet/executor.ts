import { googleSheetsChannel } from "@/inngest/channels/googleSheet";
import { NodeExecutor } from "../../types";
import { NonRetriableError } from "inngest";
import ky from "ky";

type GoogleSheetsData = {
  sheetId: string;
  rowData: string[];
};

export const googleSheetsExecutor: NodeExecutor<GoogleSheetsData> = async ({
  data,
  context,
  step,
  publish,
  nodeId
}) => {
  const { sheetId, rowData } = data;

  // Sending status
  await publish({
    ...googleSheetsChannel().status({
      nodeId: nodeId,
      status: "loading",
      message: "Sending data to Google Sheets...",
    }),
    id: `status-sending-${nodeId}`
  });

  // Validation logic
  if (!sheetId || !rowData) {
    await publish({
      ...googleSheetsChannel().status({
        nodeId: nodeId,
        status: "error",
        message: "Sheet ID or row data is missing",
      }),
      id: `status-error-missing-fields-${nodeId}`
    });
    throw new NonRetriableError("Google Sheets node requires sheetId and rowData");
  }

  const googleSheetsData = {
    sheetId,
    rowData,
    context,
  };

  try {
    const response = await ky.post("https://your-google-sheets-api.com/add-row", {
      json: googleSheetsData,
      headers: { "Content-Type": "application/json" },
      throwHttpErrors: false, // Prevents crashing on 404/500 errors
    });

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return await response.json();
    }

    return { status: response.status, text: await response.text() };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await publish({
      ...googleSheetsChannel().status({
        nodeId: nodeId,
        status: "error",
        message: `Error sending data to Google Sheets: ${errorMessage}`,
      }),
      id: `status-error-catch-${nodeId}`
    });

    throw error;
  }
};