-- The starter templates' Google Sheets nodes had no "operation": they ran
-- as Append Row (the default), but the node's settings say it is required.
-- Write it out: "operation": "append" on every Google Sheets node of the
-- app's own starter rows that has none. Nothing else in the nodes changes,
-- and templates made by people are left alone. Safe to run twice: a second
-- run finds no node without an operation.
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
WHERE t."createdById" = 'system'
  AND t."id" LIKE 'tpl\_starter\_%'
  AND jsonb_typeof(t."nodes") = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(t."nodes") AS node
    WHERE node->>'type' = 'GOOGLE_SHEETS' AND NOT (node->'data' ? 'operation')
  );
