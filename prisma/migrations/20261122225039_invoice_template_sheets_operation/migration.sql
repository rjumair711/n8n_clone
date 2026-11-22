-- The built-in "Invoice to Google Sheets" template's Google Sheets node had
-- no "operation": it ran as Append Row (the default). Write it out, as for
-- the starter templates (sheets_template_operation). Only that one row and
-- only a Sheets node without an operation; safe to run twice.
UPDATE "workflow_template" AS t
SET "nodes" = (
      SELECT jsonb_agg(
               CASE
                 WHEN node->>'type' = 'GOOGLE_SHEETS' AND NOT (node->'data' ? 'operation')
                   THEN jsonb_set(node, '{data,operation}', '"append"'::jsonb)
                 ELSE node
               END
               ORDER BY position
             )
      FROM jsonb_array_elements(t."nodes") WITH ORDINALITY AS nodes(node, position)
    ),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE t."id" = 'tpl_invoice_to_google_sheets'
  AND t."createdById" = 'system'
  AND jsonb_typeof(t."nodes") = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(t."nodes") AS node
    WHERE node->>'type' = 'GOOGLE_SHEETS' AND NOT (node->'data' ? 'operation')
  );
