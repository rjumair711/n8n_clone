"use client";

import { CredentialType } from "@prisma/client";
import { FileInput, FileOutput, FileText } from "lucide-react";
import { createIntegrationNode } from "../integration-node";
import type { IntegrationConfig, IntegrationField } from "../integration-dialog";

const FILE_HINT =
  "The file is at {{json <name>.file}} with fileName, mimeType, size and a download url. To use it in another node, type <name>.file into that node's File field.";

const fileField = (operations?: string[]): IntegrationField => ({
  name: "file",
  label: "File",
  placeholder: "pdf.file",
  description:
    "The variable of a file, for example pdf.file or myApiCall.httpResponse.file. Leave empty to use the current item when the items of a list are files.",
  ...(operations ? { operations } : {}),
});

// =========================================================================
// PDF GENERATOR
// =========================================================================
export const pdfGeneratorConfig: IntegrationConfig = {
  label: "PDF Generator",
  description:
    "Makes a PDF from text: an invoice, a report, a letter. Only Latin-script text is supported.",
  logo: FileText,
  defaultVariableName: "pdf",
  hint: FILE_HINT,
  fields: [
    {
      name: "title",
      label: "Title",
      placeholder: "Invoice {{webhook.body.orderId}}",
    },
    {
      name: "content",
      label: "Content",
      type: "textarea",
      placeholder:
        "## Customer\n{{webhook.body.name}}\n\n## Items\n- 2 x Tea: 400\n- 1 x Cake: 900\n\n---\nTotal: 1300",
      description:
        "Start a line with #, ## or ### for a heading, with - for a bullet, and write --- for a line across the page. An empty line starts a new paragraph.",
      required: true,
    },
    {
      name: "fileName",
      label: "File Name",
      placeholder: "invoice-{{webhook.body.orderId}}.pdf",
      description: "Defaults to the title.",
    },
    {
      name: "pageSize",
      label: "Page Size",
      type: "select",
      defaultValue: "A4",
      options: [
        { value: "A4", label: "A4" },
        { value: "Letter", label: "Letter" },
      ],
    },
    {
      name: "fontSize",
      label: "Font Size",
      placeholder: "11",
    },
  ],
};

export const PdfGeneratorNode = createIntegrationNode(
  pdfGeneratorConfig,
  (data) => data.title || data.fileName || "Create a PDF"
);

// =========================================================================
// CONVERT TO FILE
// =========================================================================
export const convertToFileConfig: IntegrationConfig = {
  label: "Convert to File",
  description:
    "Turns workflow data into a file: a list as an Excel or CSV spreadsheet, any value as JSON, or text.",
  logo: FileOutput,
  defaultVariableName: "converted",
  operations: [
    { value: "csv", label: "Convert to CSV" },
    { value: "xlsx", label: "Convert to Excel (XLSX)" },
    { value: "json", label: "Convert to JSON" },
    { value: "text", label: "Convert to Text File" },
  ],
  hint: FILE_HINT,
  fields: [
    {
      name: "inputPath",
      label: "Input Data",
      placeholder: "mysql.rows",
      description:
        "The variable to write. Leave empty to use the items coming from the list node connected before this one.",
      operations: ["csv", "xlsx", "json"],
    },
    {
      name: "content",
      label: "Content",
      type: "textarea",
      placeholder: "Report for {{$now}}\n\n{{aiAgentOutput.output}}",
      required: true,
      operations: ["text"],
    },
    {
      name: "fileName",
      label: "File Name",
      placeholder: "orders.csv",
      description: "The extension is added when you leave it out.",
    },
    {
      name: "sheetName",
      label: "Sheet Name",
      placeholder: "Orders",
      operations: ["xlsx"],
    },
    {
      name: "delimiter",
      label: "Delimiter",
      type: "select",
      defaultValue: "comma",
      options: [
        { value: "comma", label: "Comma" },
        { value: "semicolon", label: "Semicolon" },
      ],
      operations: ["csv"],
    },
  ],
};

export const ConvertToFileNode = createIntegrationNode(
  convertToFileConfig,
  (data) => data.fileName || undefined
);

// =========================================================================
// EXTRACT FROM FILE
// =========================================================================
export const extractFromFileConfig: IntegrationConfig = {
  label: "Extract from File",
  description:
    "Reads a file back into workflow data: the rows of an Excel or CSV sheet (which go on as items), or the text of a PDF, Word or text file.",
  logo: FileInput,
  defaultVariableName: "extracted",
  operations: [
    { value: "csv", label: "Extract from CSV" },
    { value: "xlsx", label: "Extract from Excel (XLSX)" },
    { value: "pdf", label: "Extract Text from PDF" },
    { value: "docx", label: "Extract Text from Word (DOCX)" },
    { value: "json", label: "Extract from JSON" },
    { value: "text", label: "Extract from Text File" },
  ],
  hint: "CSV and Excel: rows at {{json <name>.items}}, and each row as {{item.columnName}} in the next nodes. PDF, Word and text: {{<name>.text}} (PDF also has <name>.pages). JSON: {{json <name>.data}}. Scanned PDFs are pictures and have no text; old .xls and .doc files are not supported.",
  fields: [
    fileField(),
    {
      name: "header",
      label: "First Row Is Header",
      type: "select",
      defaultValue: "yes",
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No (name the columns column1, column2...)" },
      ],
      operations: ["csv", "xlsx"],
    },
    {
      name: "sheetName",
      label: "Sheet Name",
      placeholder: "Sheet1",
      description: "Leave empty for the first sheet.",
      operations: ["xlsx"],
    },
    {
      name: "delimiter",
      label: "Delimiter",
      type: "select",
      defaultValue: "comma",
      options: [
        { value: "comma", label: "Comma" },
        { value: "semicolon", label: "Semicolon" },
      ],
      operations: ["csv"],
    },
  ],
};

export const ExtractFromFileNode = createIntegrationNode(
  extractFromFileConfig,
  (data) => data.file || undefined
);

// =========================================================================
// GOOGLE DRIVE
// =========================================================================
const folderField = (operations: string[], label = "Folder"): IntegrationField => ({
  name: "folderId",
  label,
  placeholder: "Folder ID or link",
  description: "Leave empty for the top of My Drive.",
  operations,
});

export const googleDriveConfig: IntegrationConfig = {
  label: "Google Drive",
  description: "Upload, download, find and delete files in Google Drive.",
  logo: "/logos/google-drive.svg",
  credentialType: CredentialType.GOOGLE_OAUTH2,
  credentialLabel: "Google Account",
  defaultVariableName: "drive",
  operations: [
    { value: "search_files", label: "Search Files and Folders" },
    { value: "upload_file", label: "Upload File" },
    { value: "download_file", label: "Download File" },
    { value: "create_folder", label: "Create Folder" },
    { value: "delete_file", label: "Delete File" },
  ],
  hint: "Download puts the file at {{json <name>.file}}; Google Docs and Slides arrive as PDF and Sheets as CSV. Search results are at {{json <name>.files}}. Google accounts connected before Drive was added have to be connected again.",
  fields: [
    {
      name: "query",
      label: "Name Contains",
      placeholder: "invoice",
      description: "Leave empty to list the newest files.",
      operations: ["search_files"],
    },
    folderField(["search_files"], "In Folder"),
    {
      name: "limit",
      label: "Limit",
      placeholder: "20",
      description: "How many results to return (up to 100).",
      operations: ["search_files"],
    },
    { ...fileField(["upload_file"]), required: false },
    {
      name: "fileName",
      label: "File Name",
      placeholder: "invoice-{{webhook.body.orderId}}.pdf",
      description: "Defaults to the file's own name.",
      operations: ["upload_file"],
    },
    folderField(["upload_file", "create_folder"], "Parent Folder"),
    {
      name: "fileId",
      label: "File",
      placeholder: "File ID or link",
      description: "The ID from the file's link, or the whole link.",
      required: true,
      operations: ["download_file", "delete_file"],
    },
    {
      name: "folderName",
      label: "Folder Name",
      placeholder: "Invoices 2026",
      required: true,
      operations: ["create_folder"],
    },
  ],
};

export const GoogleDriveNode = createIntegrationNode(googleDriveConfig);
