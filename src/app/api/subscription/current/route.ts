import { resolveWorkspace } from "@/lib/workspaces";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

// `?own=1` (the billing page): the signed-in user's own plan, whatever
// workspace the browser is in
export async function GET(request: Request) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  // The plan and its counters are the workspace's: its owner's
  const workspace = await resolveWorkspace(
    session.user,
    new URL(request.url).searchParams.get("own") ? null : undefined
  );

  const user = await prisma.user.findUnique({
    where: {
      id: workspace.ownerId,
    },
  });

  if (!user) {
    return NextResponse.json(
      { error: "User not found" },
      { status: 404 }
    );
  }

  // 💡 Trust your database! Your webhook already successfully sets this to "PRO".
  // This drops your API response time from 45 seconds down to single-digit milliseconds.
  return NextResponse.json({
    plan: user.plan || "FREE",
    workflowCount: user.workflowCount,
    executionsUsed: user.executionsUsed,
    trialEndsAt: user.trialEndsAt,
    workspace: {
      id: workspace.id,
      name: workspace.name,
      role: workspace.role,
      personal: workspace.personal,
    },
  });
}