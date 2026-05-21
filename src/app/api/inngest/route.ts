import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { executeWorkflow } from "@/inngest/functions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = serve({
  client: inngest,
  functions: [executeWorkflow],
});

export { handler as GET, handler as POST, handler as PUT };