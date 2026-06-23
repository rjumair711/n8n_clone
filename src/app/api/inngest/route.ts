import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { executeWorkflow } from "@/inngest/functions";
import { workflowCronHeartbeat } from "../../../inngest/functions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const handler = serve({
  client: inngest,
  functions: [
    executeWorkflow,
    workflowCronHeartbeat,
  ],
});

export { handler as GET, handler as POST, handler as PUT };