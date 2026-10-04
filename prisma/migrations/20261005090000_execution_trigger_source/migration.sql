-- How an execution was started: manual, manual-test, chat, schedule,
-- webhook, stripe or google-form. Older executions have no value.
ALTER TABLE "Execution" ADD COLUMN "triggerSource" TEXT;
