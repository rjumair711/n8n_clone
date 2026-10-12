import "server-only"

import { PLAN_LIMITS } from "@/config/plans"
import { canUseAdminActions } from "./admin"
import prisma from "./db"
import {
  SSO_ADMIN_PROVIDER_LIMIT,
  SSO_JOIN_ROLE,
  SSO_PLAN_PROVIDER_LIMIT,
} from "./sso-config"

// Single sign-on: who may register an identity provider, and what happens
// to an account that is made by signing in through one. Used by the sso
// plugin in auth.ts.

/**
 * How many providers an account may register. 0 refuses the registration.
 *
 * Read from the database, not from the session: the plan and the
 * two-factor setting are what they are now.
 */
export const getSsoProviderLimit = async (sessionUser: { id: string }): Promise<number> => {
  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { email: true, emailVerified: true, twoFactorEnabled: true, plan: true },
  })

  if (!user) return 0

  // A platform admin, with two-factor on like every admin action
  if (canUseAdminActions(user)) return SSO_ADMIN_PROVIDER_LIMIT

  return PLAN_LIMITS[user.plan]?.features.enterprise ? SSO_PLAN_PROVIDER_LIMIT : 0
}

/**
 * Adds a new account to the workspace of whoever registered the provider
 * it signed in through, with the least role. Never throws: the sign-in
 * itself has worked.
 */
export const joinSsoWorkspace = async (userId: string, registrantId: string | null | undefined) => {
  if (!registrantId || registrantId === userId) return

  try {
    const workspace = await prisma.workspace.findUnique({
      where: { ownerId: registrantId },
      select: { id: true },
    })

    if (!workspace) return

    await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
      // Already a member: the role they have stays
      update: {},
      create: { workspaceId: workspace.id, userId, role: SSO_JOIN_ROLE },
    })
  } catch (error) {
    console.error(
      "[RXJ] Could not add an SSO account to its workspace:",
      error instanceof Error ? error.name : "error"
    )
  }
}
