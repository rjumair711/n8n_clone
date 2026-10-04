"use client";

import { CredentialType } from "@prisma/client";
import { createIntegrationNode } from "../integration-node";
import type { IntegrationConfig } from "../integration-dialog";

export const airtableConfig: IntegrationConfig = {
  label: "Airtable",
  description: "Read and write records in an Airtable base.",
  logo: "/logos/airtable.svg",
  credentialType: CredentialType.AIRTABLE,
  credentialLabel: "Airtable Credential",
  defaultVariableName: "airtable",
  operations: [
    { value: "list_records", label: "List Records" },
    { value: "create_record", label: "Create Record" },
    { value: "update_record", label: "Update Record" },
    { value: "delete_record", label: "Delete Record" },
  ],
  fields: [
    {
      name: "baseId",
      label: "Base ID",
      placeholder: "appXXXXXXXXXXXXXX",
      description: "Starts with app; found in the base's API documentation.",
      required: true,
    },
    {
      name: "table",
      label: "Table",
      placeholder: "Tasks",
      description: "The table name or its ID (tbl...).",
      required: true,
    },
    {
      name: "recordId",
      label: "Record ID",
      placeholder: "recXXXXXXXXXXXXXX",
      required: true,
      operations: ["update_record", "delete_record"],
    },
    {
      name: "fieldsJson",
      label: "Fields JSON",
      type: "textarea",
      placeholder: '{\n  "Name": "{{webhook.body.name}}",\n  "Status": "Todo"\n}',
      description: "A JSON object of column names and values.",
      required: true,
      operations: ["create_record", "update_record"],
    },
    {
      name: "filterByFormula",
      label: "Filter Formula",
      placeholder: "{Status} = 'Todo'",
      description: "An Airtable formula; only matching records are returned.",
      operations: ["list_records"],
    },
    {
      name: "maxRecords",
      label: "Max Records",
      placeholder: "50",
      description: "How many records to return (up to 100).",
      operations: ["list_records"],
    },
  ],
};

export const AirtableNode = createIntegrationNode(airtableConfig, (data) => {
  const operation = airtableConfig.operations.find(
    (option) => option.value === data.operation
  )?.label;

  return data.table ? `${operation}: ${data.table}` : undefined;
});
