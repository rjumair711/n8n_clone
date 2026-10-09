import { TRPCError } from "@trpc/server";

/**
 * "Not found" for a record that does not exist or belongs to someone else.
 * The two cases are deliberately the same error with the same message, so
 * an id cannot be probed to learn whether another account has it.
 *
 * tRPC answers 404 for it; route handlers turn it into a 404 response with
 * notFoundResponse().
 */
export class NotFoundError extends TRPCError {
  constructor(resource: string) {
    super({ code: "NOT_FOUND", message: `${resource} not found.` });
    this.name = "NotFoundError";
  }
}

type Owned = { userId?: string | null };

/**
 * The one ownership check of the app: returns the record when it exists and
 * belongs to the user, and throws NotFoundError otherwise.
 *
 *   const workflow = assertOwnership(
 *     await prisma.workflow.findUnique({ where: { id } }),
 *     userId,
 *     "Workflow"
 *   );
 *
 * Records owned through another record say where their owner is:
 *
 *   assertOwnership(execution, userId, "Execution", (e) => e.workflow.userId);
 */
export function assertOwnership<T extends Owned>(
  record: T | null | undefined,
  userId: string,
  resource: string
): T;
export function assertOwnership<T>(
  record: T | null | undefined,
  userId: string,
  resource: string,
  getOwnerId: (record: T) => string | null | undefined
): T;
export function assertOwnership<T>(
  record: T | null | undefined,
  userId: string,
  resource: string,
  getOwnerId: (record: T) => string | null | undefined = (owned) =>
    (owned as Owned).userId
): T {
  if (record === null || record === undefined) {
    throw new NotFoundError(resource);
  }

  const ownerId = getOwnerId(record);

  // No user id, or a record without an owner, never matches
  if (!userId || !ownerId || ownerId !== userId) {
    throw new NotFoundError(resource);
  }

  return record;
}

/**
 * For route handlers: the 404 response for a NotFoundError, or null when the
 * error is something else and should be thrown on.
 */
export const notFoundResponse = (error: unknown): Response | null =>
  error instanceof NotFoundError
    ? Response.json({ error: error.message }, { status: 404 })
    : null;
