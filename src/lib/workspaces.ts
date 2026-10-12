import "server-only";

import { cookies } from "next/headers";
import prisma from "./db";
import {
  WORKSPACE_COOKIE,
  isWorkspaceRole,
  personalWorkspaceName,
  type WorkspaceRole,
} from "./workspace-roles";

// Teams. Every user has a workspace of their own and can be a member of
// others.
//
// A workspace's data is stored under its owner's user id: a workflow or a
// credential made by a member has `userId` = the owner, and `workspaceId` =
// the workspace. So everything that already reads data by user id (the
// engine, credentials when a node runs, plan limits, AI budgets and usage)
// works for a workspace as it is, and "whose data" is one question with
// one answer: the owner's. Who may read or change it is the member's role.

export type ActiveWorkspace = {
  id: string;
  name: string;
  // The user id the workspace's data is stored under
  ownerId: string;
  role: WorkspaceRole;
  // The signed-in user's own workspace
  personal: boolean;
  // Who did it, for the audit log, when it was not the owner
  actor?: string;
};

type SessionUser = { id: string; name?: string | null; email?: string | null };

/**
 * The user's own workspace. It is made by the migration for everyone who
 * was there, and here the first time for everyone who signs up later.
 */
export const ensurePersonalWorkspace = async (user: SessionUser) => {
  const existing = await prisma.workspace.findUnique({
    where: { ownerId: user.id },
    select: { id: true, name: true },
  });

  if (existing) return existing;

  // Two first requests at the same moment: one creates, the other finds
  const workspace = await prisma.workspace.upsert({
    where: { ownerId: user.id },
    update: {},
    create: {
      name: personalWorkspaceName(user.name),
      ownerId: user.id,
      members: { create: { userId: user.id, role: "OWNER" } },
    },
    select: { id: true, name: true },
  });

  // Rows made by code from before workspaces (a deployment that was still
  // running the old code)
  await Promise.all([
    prisma.workflow.updateMany({
      where: { userId: user.id, workspaceId: null },
      data: { workspaceId: workspace.id },
    }),
    prisma.credential.updateMany({
      where: { userId: user.id, workspaceId: null },
      data: { workspaceId: workspace.id },
    }),
  ]);

  return workspace;
};

const readWorkspaceCookie = async () => {
  try {
    return (await cookies()).get(WORKSPACE_COOKIE)?.value || null;
  } catch {
    // Not inside a request (a script, a background job)
    return null;
  }
};

/**
 * The workspace a request works in: the one the browser picked when the
 * user is a member of it, their own otherwise. The membership is read
 * from the database every time, so a member who was removed, or whose
 * role changed, is treated that way on their next request.
 */
export const resolveWorkspace = async (
  user: SessionUser,
  // For server-side callers that are not a browser request
  pickedId?: string | null
): Promise<ActiveWorkspace> => {
  const picked = pickedId === undefined ? await readWorkspaceCookie() : pickedId;

  if (picked) {
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: picked, userId: user.id } },
      select: {
        role: true,
        workspace: { select: { id: true, name: true, ownerId: true } },
      },
    });

    if (membership && isWorkspaceRole(membership.role)) {
      const personal = membership.workspace.ownerId === user.id;

      return {
        id: membership.workspace.id,
        name: membership.workspace.name,
        ownerId: membership.workspace.ownerId,
        // The owner is the owner, whatever the row says
        role: personal ? "OWNER" : membership.role === "OWNER" ? "ADMIN" : membership.role,
        personal,
        ...(personal ? {} : { actor: user.email || user.id }),
      };
    }
  }

  const own = await ensurePersonalWorkspace(user);

  return { id: own.id, name: own.name, ownerId: user.id, role: "OWNER", personal: true };
};

/**
 * The workspaces a user can switch between: their own first.
 */
export const listWorkspaces = async (user: SessionUser) => {
  const own = await ensurePersonalWorkspace(user);

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: user.id, workspace: { ownerId: { not: user.id } } },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      workspace: {
        select: { id: true, name: true, owner: { select: { name: true, email: true } } },
      },
    },
  });

  return [
    { id: own.id, name: own.name, role: "OWNER" as WorkspaceRole, personal: true, owner: null },
    ...memberships.flatMap((membership) =>
      isWorkspaceRole(membership.role)
        ? [
            {
              id: membership.workspace.id,
              name: membership.workspace.name,
              role: (membership.role === "OWNER" ? "ADMIN" : membership.role) as WorkspaceRole,
              personal: false,
              owner: membership.workspace.owner.name || membership.workspace.owner.email,
            },
          ]
        : []
    ),
  ];
};
