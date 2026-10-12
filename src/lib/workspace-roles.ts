// Teams: the roles a member of a workspace can have and what each may do.
// No server imports: the settings page shows the same rules the server
// enforces, and the tests use them.

export const WORKSPACE_ROLES = ["OWNER", "ADMIN", "EDITOR", "VIEWER"] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

// The roles a member can be given. A workspace has one owner: the account
// it was made for.
export const ASSIGNABLE_ROLES = ["ADMIN", "EDITOR", "VIEWER"] as const;

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export const isWorkspaceRole = (value: unknown): value is WorkspaceRole =>
  (WORKSPACE_ROLES as readonly unknown[]).includes(value);

export const isAssignableRole = (value: unknown): value is AssignableRole =>
  (ASSIGNABLE_ROLES as readonly unknown[]).includes(value);

const RANK: Record<WorkspaceRole, number> = {
  VIEWER: 1,
  EDITOR: 2,
  ADMIN: 3,
  OWNER: 4,
};

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  EDITOR: "Editor",
  VIEWER: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<WorkspaceRole, string> = {
  OWNER: "Everything, and the workspace's plan and billing are the owner's.",
  ADMIN: "Everything an editor can, plus credentials, AI budgets and members.",
  EDITOR: "Builds, runs and deletes workflows, and uses credentials without seeing their values.",
  VIEWER: "Sees workflows, executions and the names of credentials. Changes nothing.",
};

/**
 * Whether a role is at least the one an action needs. A role that is not
 * one of the four has no rights.
 */
export const hasRole = (role: unknown, needed: WorkspaceRole): boolean =>
  isWorkspaceRole(role) && RANK[role] >= RANK[needed];

export const roleError = (role: unknown, needed: WorkspaceRole) =>
  `Your role in this workspace (${isWorkspaceRole(role) ? ROLE_LABELS[role] : "none"}) cannot do this. It needs ${ROLE_LABELS[needed]}${needed === "OWNER" ? "" : " or higher"}.`;

/**
 * Whether `actor` may give `target` the role `next`, or remove them when
 * `next` is null. Members are managed by admins and the owner; only the
 * owner decides who is an admin, and the owner's own role never changes.
 */
export const canManageMember = ({
  actor,
  target,
  next,
}: {
  actor: unknown;
  // The member's role now
  target: unknown;
  next: AssignableRole | null;
}): boolean => {
  if (!hasRole(actor, "ADMIN") || !isWorkspaceRole(target)) return false;
  if (target === "OWNER") return false;
  if (actor === "OWNER") return true;

  // An admin: not other admins, and nobody becomes one
  return target !== "ADMIN" && next !== "ADMIN";
};

// Sent by the browser to say which workspace it is working in. The server
// checks the membership on every request: the cookie only picks, it grants
// nothing.
export const WORKSPACE_COOKIE = "rxj-workspace";

export const normalizeInviteEmail = (email: string) => email.trim().toLowerCase();

export const personalWorkspaceName = (userName: string | null | undefined) => {
  const name = userName?.trim();

  return name ? `${name}'s workspace` : "My workspace";
};
