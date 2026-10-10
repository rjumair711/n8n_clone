import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { executeWorkflow } from "@/inngest/functions";
import { workflowCronHeartbeat } from "../../../inngest/functions";
import { gmailTriggerPoll } from "@/inngest/gmail-trigger";
import { rssTriggerPoll } from "@/inngest/rss-trigger";
import { workflowFilesCleanup } from "@/inngest/files-cleanup";
import { executionDataCleanup } from "@/inngest/execution-cleanup";
import { getStartupErrors } from "@/lib/startup-checks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Each workflow step is one request to this route; the AI Agent loop and slow
// APIs can take well over the default limit
export const maxDuration = 300;

const inngestHandler = serve({
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

// The server refuses to start in production without the Inngest signing key
// (src/instrumentation.ts). Checked here as well, in case a host starts the
// app in a way that skips that: without the key this endpoint answers
// nothing.
const handler = (...args: Parameters<typeof inngestHandler>) => {
  const [error] = getStartupErrors();

  if (error) {
    return Response.json({ error }, { status: 500 });
  }

  return inngestHandler(...args);
};

export { handler as GET, handler as POST, handler as PUT };