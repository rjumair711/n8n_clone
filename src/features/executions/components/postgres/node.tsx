"use client";

import { CredentialType } from "@prisma/client";
import { createIntegrationNode } from "../integration-node";
import type { IntegrationConfig } from "../integration-dialog";

export const postgresConfig: IntegrationConfig = {
  label: "Postgres",
  description: "Run queries against a PostgreSQL database.",
  logo: "/logos/postgres.svg",
  credentialType: CredentialType.POSTGRES,
  credentialLabel: "Postgres Credential",
  defaultVariableName: "postgres",
  operations: [
    { value: "execute_query", label: "Execute Query" },
    { value: "select_rows", label: "Select Rows" },
    { value: "insert_row", label: "Insert Row" },
  ],
  fields: [
    {
      name: "query",
      label: "Query",
      type: "textarea",
      placeholder: "SELECT * FROM orders WHERE email = $1 LIMIT 10",
      description:
        "Use $1, $2... for values and list them in Query Parameters, so they are never pasted into the SQL.",
      required: true,
      operations: ["execute_query"],
    },
    {
      name: "paramsJson",
      label: "Query Parameters",
      type: "textarea",
      placeholder: '["{{webhook.body.email}}"]',
      description: "A JSON array with one value per $1, $2... placeholder.",
      operations: ["execute_query"],
    },
    {
      name: "table",
      label: "Table",
      placeholder: "orders",
      description: "Table name; use schema.table for another schema.",
      required: true,
      operations: ["select_rows", "insert_row"],
    },
    {
      name: "limit",
      label: "Limit",
      placeholder: "50",
      description: "How many rows to return (up to 500).",
      operations: ["select_rows"],
    },
    {
      name: "rowJson",
      label: "Row JSON",
      type: "textarea",
      placeholder: '{\n  "email": "{{webhook.body.email}}",\n  "total": 100\n}',
      description: "A JSON object of column names and values.",
      required: true,
      operations: ["insert_row"],
    },
  ],
};

export const PostgresNode = createIntegrationNode(postgresConfig, (data) => {
  if (data.operation === "execute_query") {
    return data.query ? `${data.query.slice(0, 40)}...` : undefined;
  }

  const operation = postgresConfig.operations.find(
    (option) => option.value === data.operation
  )?.label;

  return data.table ? `${operation}: ${data.table}` : undefined;
});
