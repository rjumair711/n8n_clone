import { resolveWorkspace } from "@/lib/workspaces";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { notFoundResponse } from "@/lib/ownership";
import { getOwnedExecutionNodes } from "@/features/executions/server/nodes";

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

  try {
    return NextResponse.json(
      await getOwnedExecutionNodes(
        executionId,
        // Of the workspace the user is working in: any member may read
        (await resolveWorkspace(session.user)).ownerId
      )
    );
  } catch (error) {
    const response = notFoundResponse(error);
    if (response) return response;
    throw error;
  }
}
