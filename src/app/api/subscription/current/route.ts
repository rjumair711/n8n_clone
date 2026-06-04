import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const user = await prisma.user.findUnique({
    where: {
      id: session.user.id,
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
  });
}