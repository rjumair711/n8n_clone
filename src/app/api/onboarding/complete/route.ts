import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

import { headers } from "next/headers";

import { NextResponse } from "next/server";

export async function POST() {
  const session =
    await auth.api.getSession({
      headers: await headers(),
    });

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  await prisma.user.update({
    where: {
      id: session.user.id,
    },

    data: {
      hasCompletedOnboarding: true,
    },
  });

  return NextResponse.json({
    success: true,
  });
}