import { NextRequest, NextResponse } from "next/server";
import { getSubscriptionToken } from "@inngest/realtime";
import { inngest } from "@/inngest/client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ channel: string }> }
) {
  const { channel } = await params;

  const token = await getSubscriptionToken(inngest, {
    channel,
    topics: ["status", "response"],
  });

  return NextResponse.json(token);
}