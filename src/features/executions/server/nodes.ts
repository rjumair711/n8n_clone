import prisma from "@/lib/db";
import { assertOwnership } from "@/lib/ownership";

/**
 * The node logs of an execution, for its owner only. They contain the
 * workflow data, so someone else's execution is "not found" (NotFoundError),
 * not an empty list.
 */
export const getOwnedExecutionNodes = async (
  executionId: string,
  userId: string
) => {
  assertOwnership(
    await prisma.execution.findUnique({
      where: { id: executionId },
      select: { workflow: { select: { userId: true } } },
    }),
    userId,
    "Execution",
    (execution) => execution.workflow.userId
  );

  return prisma.executionNode.findMany({
    where: { executionId },
    orderBy: { startedAt: "asc" },
  });
};
