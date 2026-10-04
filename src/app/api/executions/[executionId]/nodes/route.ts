import prisma from "@/lib/db";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  {
    params,
  }: {
    params: Promise<{
      executionId: string;
    }>;
  }
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

  const { executionId } = await params;

  // Node logs contain the workflow data, so only the owner may read them
  const executionNodes =
    await prisma.executionNode.findMany({
      where: {
        executionId,

        execution: {
          workflow: {
            userId: session.user.id,
          },
        },
      },

      orderBy: {
        startedAt: "asc",
      },
    });

  return NextResponse.json(executionNodes);
}
