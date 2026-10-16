import { resolveWorkspace } from "@/lib/workspaces";
import { auth } from "@/lib/auth";
import { getUsage } from "@/lib/subscription/usage-counts";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { perf } from "@/lib/perf";

// `?own=1` (the billing page): the signed-in user's own plan, whatever
// workspace the browser is in
export async function GET(request: Request) {
  return perf("api /subscription/current total", () => getCurrent(request));
}

async function getCurrent(request: Request) {
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

  // Counted from the rows, like the plan's limits are: the Workflows list's
  // workflows, and the executions the engine counted this month
  const usage = await getUsage(workspace.ownerId);

  if (!usage) {
    return NextResponse.json(
      { error: "User not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    plan: usage.plan || "FREE",
    workflowCount: usage.workflowCount,
    executionsUsed: usage.executionsUsed,
    trialEndsAt: usage.trialEndsAt,
    workspace: {
      id: workspace.id,
      name: workspace.name,
      role: workspace.role,
      personal: workspace.personal,
    },
  });
}