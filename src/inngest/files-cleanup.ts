import { deleteExpiredWorkflowFiles } from "@/lib/workflow-files";
import { inngest } from "./client";
import { deleteOldWebhookDeliveries } from "./utils";

// Files made by workflows are kept for FILE_RETENTION_DAYS (7 by default),
// then removed so the database does not fill up with old downloads
export const workflowFilesCleanup = inngest.createFunction(
  { id: "workflow-files-cleanup", retries: 1 },
  { cron: "17 3 * * *" },
  async ({ step }) => {
    const deleted = await step.run("delete-expired-files", () =>
      deleteExpiredWorkflowFiles()
    );

    // The records that stop a re-sent webhook from starting a second run
    const deliveries = await step.run("delete-old-webhook-deliveries", () =>
      deleteOldWebhookDeliveries()
    );

    return { deleted, deliveries };
  }
);
