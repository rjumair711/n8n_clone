import prisma from "@/lib/db";
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
  const { executionId } = await params;

  const executionNodes =
    await prisma.executionNode.findMany({
      where: {
        executionId,
      },

      orderBy: {
        startedAt: "asc",
      },
    });

  return NextResponse.json(executionNodes);
}