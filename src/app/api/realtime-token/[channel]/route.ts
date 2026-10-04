import { NextRequest, NextResponse } from "next/server";
import { getSubscriptionToken } from "@inngest/realtime";
import { headers } from "next/headers";
import { inngest } from "@/inngest/client";
import { auth } from "@/lib/auth";

// Channels the editor is allowed to subscribe to
const ALLOWED_CHANNELS = ["code-execution", "ai-agent-execution"];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ channel: string }> }
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { channel } = await params;

  if (!ALLOWED_CHANNELS.includes(channel)) {
    return NextResponse.json(
      { error: "Unknown channel" },
      { status: 404 }
    );
  }

  const token = await getSubscriptionToken(inngest, {
    channel,
    topics: ["status", "response"],
  });

  return NextResponse.json(token);
}
