-- Workflows now only run from schedules and webhooks while they are active.
-- "active" defaulted to false and was never used, so switch on every workflow
-- that already has such a trigger: nothing that runs today stops running.
UPDATE "Workflow"
SET "active" = true
WHERE "id" IN (
  SELECT "workflowId"
  FROM "Node"
  WHERE "type" IN ('SCHEDULE_TRIGGER', 'GOOGLE_FORM_TRIGGER', 'STRIPE_TRIGGER')
);
