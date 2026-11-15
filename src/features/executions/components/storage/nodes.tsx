"use client";

import { CredentialType } from "@prisma/client";
import { ImageIcon, TableIcon } from "lucide-react";
import { DATA_TABLE_LIMITS, DATA_TABLE_OPERATIONS } from "../../lib/data-table";
import { IMAGE_PROVIDERS, IMAGE_QUALITIES, IMAGE_SIZES } from "../../lib/image-options";
import { createIntegrationNode } from "../integration-node";
import type { IntegrationConfig } from "../integration-dialog";

// =========================================================================
// DATA TABLE
// =========================================================================
export const dataTableConfig: IntegrationConfig = {
  label: "Data Table",
  description:
    "Simple built-in storage: rows by key in a named table of your account. For \"already contacted\" lists, opt-outs and an agent's state per contact. No credential needed.",
  logo: TableIcon,
  defaultVariableName: "dataTable",
  operations: DATA_TABLE_OPERATIONS.map(({ value, label }) => ({ value, label })),
  hint: `The table is created the first time a row is written. Results: Get Row {{<name>.found}} and {{<name>.data}}; Check Row Exists {{<name>.exists}} (put an IF after it to skip people you already contacted); List Rows {{<name>.rows}}. Up to ${DATA_TABLE_LIMITS.rowsPerTable.toLocaleString("en-US")} rows per table. See and delete rows in Settings → Data tables.`,
  fields: [
    {
      name: "tableName",
      label: "Table Name",
      placeholder: "contacted_leads",
      description: "Any name; the same name in another workflow is the same table.",
      required: true,
    },
    {
      name: "key",
      label: "Key",
      placeholder: "{{lead.email}}",
      description: "What finds the row: an email, a phone number, an order ID. Emails are compared in lower case.",
      required: true,
      operations: ["upsert_row", "get_row", "find_row", "delete_row"],
    },
    {
      name: "rowData",
      label: "Row Data (JSON)",
      type: "textarea",
      placeholder: '{"status": "contacted", "at": "{{$now}}"}',
      description: "A JSON object. An existing row keeps the fields this does not name. Empty: the row only has its key.",
      operations: ["upsert_row"],
    },
    {
      name: "limit",
      label: "Limit",
      placeholder: String(DATA_TABLE_LIMITS.listDefault),
      description: `Newest first. Empty: ${DATA_TABLE_LIMITS.listDefault}; at most ${DATA_TABLE_LIMITS.listMax}.`,
      operations: ["list_rows"],
    },
  ],
};

export const DataTableNode = createIntegrationNode(dataTableConfig, (data) =>
  data.tableName ? `Table: ${data.tableName}` : undefined
);

// =========================================================================
// IMAGE GENERATION
// =========================================================================
const imageCredential = (values: { operation?: string }) =>
  (values.operation ?? "openai") === "openai" ? CredentialType.OPENAI : CredentialType.OPENAI_COMPATIBLE;

export const imageGenerationConfig: IntegrationConfig = {
  label: "Image Generation",
  description:
    "Creates a picture from a text prompt with OpenAI (gpt-image-1, DALL·E 3) or any OpenAI-compatible /images/generations endpoint. The result is a file for the Instagram / Facebook Post, WhatsApp, Telegram or email nodes.",
  logo: ImageIcon,
  credentialTypeFor: imageCredential,
  credentialLabel: "API Key Credential",
  defaultVariableName: "image",
  operations: IMAGE_PROVIDERS.map(({ value, label }) => ({ value, label })),
  hint: "Operation is the provider. The picture is a file at {{<name>.file}}: use <name>.file in the Instagram / Facebook Post node, a WhatsApp or Telegram File field, or an email's Attachments. It is stored like other workflow files (same size limit, removed after the retention period). Each picture is billed by the provider.",
  fields: [
    {
      name: "prompt",
      label: "Prompt",
      type: "textarea",
      placeholder: "A bright product photo of {{product.title}} on a white table, soft daylight",
      description: "What to draw, up to 4000 characters.",
      required: true,
    },
    {
      name: "baseUrl",
      label: "Base URL",
      placeholder: "https://api.example.com/v1",
      description: "The address of an OpenAI-compatible API, without /images/... at the end.",
      required: true,
      operations: ["custom"],
    },
    {
      name: "model",
      label: "Model",
      placeholder: "gpt-image-1",
      description: "Empty: gpt-image-1 on OpenAI. dall-e-3 also works. Required for a custom base URL.",
    },
    {
      name: "size",
      label: "Size",
      type: "select",
      defaultValue: "1024x1024",
      options: IMAGE_SIZES,
    },
    {
      name: "quality",
      label: "Quality",
      type: "select",
      defaultValue: "auto",
      options: IMAGE_QUALITIES,
      description: "Higher quality costs more. On DALL·E 3, High is \"hd\".",
    },
    {
      name: "fileName",
      label: "File Name",
      placeholder: "image",
      description: "Without the extension. Empty: image.",
    },
  ],
};

export const ImageGenerationNode = createIntegrationNode(imageGenerationConfig, (data) =>
  data.prompt ? "Generate an image" : undefined
);
