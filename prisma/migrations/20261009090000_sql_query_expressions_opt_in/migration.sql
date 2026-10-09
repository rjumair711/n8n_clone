-- Data migration, no schema change.
--
-- The Postgres and MySQL nodes now refuse {{ }} expressions in the query
-- text unless "Allow expressions in query text (unsafe)" is on. Nodes saved
-- before the option existed and that already have an expression in their
-- query get the option switched on, so their workflows keep running.

UPDATE "Node"
SET "data" = "data" || '{"allowQueryExpressions": "true"}'::jsonb
WHERE "type"::text IN ('POSTGRES', 'MYSQL')
  AND jsonb_typeof("data") = 'object'
  AND "data"->>'query' LIKE '%{{%}}%'
  AND NOT ("data" ? 'allowQueryExpressions');

-- The same for the nodes stored inside workflow templates
UPDATE "workflow_template" AS template
SET "nodes" = (
  SELECT jsonb_agg(
    CASE
      WHEN node->>'type' IN ('POSTGRES', 'MYSQL')
        AND jsonb_typeof(node->'data') = 'object'
        AND node->'data'->>'query' LIKE '%{{%}}%'
        AND NOT (node->'data' ? 'allowQueryExpressions')
      THEN jsonb_set(node, '{data,allowQueryExpressions}', '"true"'::jsonb)
      ELSE node
    END
    ORDER BY position
  )
  FROM jsonb_array_elements(template."nodes") WITH ORDINALITY AS item(node, position)
)
WHERE jsonb_typeof(template."nodes") = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(template."nodes") AS node
    WHERE node->>'type' IN ('POSTGRES', 'MYSQL')
      AND jsonb_typeof(node->'data') = 'object'
      AND node->'data'->>'query' LIKE '%{{%}}%'
      AND NOT (node->'data' ? 'allowQueryExpressions')
  );
