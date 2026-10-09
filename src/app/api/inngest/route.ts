import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { executeWorkflow } from "@/inngest/functions";
import { workflowCronHeartbeat } from "../../../inngest/functions";
import { gmailTriggerPoll } from "@/inngest/gmail-trigger";
import { rssTriggerPoll } from "@/inngest/rss-trigger";
import { workflowFilesCleanup } from "@/inngest/files-cleanup";
import { executionDataCleanup } from "@/inngest/execution-cleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Each workflow step is one request to this route; the AI Agent loop and slow
// APIs can take well over the default limit
export const maxDuration = 300;

const handler = serve({
  client: inngest,
  functions: [
    executeWorkflow,
    workflowCronHeartbeat,
    gmailTriggerPoll,
    rssTriggerPoll,
    workflowFilesCleanup,
    executionDataCleanup,
  ],
});

export { handler as GET, handler as POST, handler as PUT };