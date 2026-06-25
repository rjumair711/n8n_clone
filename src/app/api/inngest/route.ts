import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { executeWorkflow } from "@/inngest/functions";
import { workflowCronHeartbeat } from "../../../inngest/functions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = serve({
  client: inngest,
  // Explicitly sanitize the signing key to strip any literal quotes or trailing whitespace
  signingKey: process.env.INNGEST_SIGNING_KEY?.replace(/['"]/g, "").trim(),
  functions: [
    executeWorkflow,
    workflowCronHeartbeat,
  ],
});

export { handler as GET, handler as POST, handler as PUT };