import { TRPCError } from "@trpc/server";
import z from "zod";
import { recordAudit } from "@/lib/audit-log";
import prisma from "@/lib/db";
import {
    ASSIGNABLE_ROLES,
    canManageMember,
    isWorkspaceRole,
    normalizeInviteEmail,
    roleError,
} from "@/lib/workspace-roles";
import { listWorkspaces } from "@/lib/workspaces";
import {
    createTRPCRouter,
    protectedProcedure,
    viewerProcedure,
    workspaceAdminProcedure,
} from "@/trpc/init";

// Teams: who is in a workspace, with which role, and who was asked to
// join. A workspace's plan is its owner's and is not changed from here.

const MAX_PENDING_INVITES = 50;

// The same rule as src/lib/auth.ts: addresses are verified when the app
// can send email and was not told otherwise
const emailVerificationEnabled =
    !!process.env.RESEND_API_KEY && process.env.REQUIRE_EMAIL_VERIFICATION !== "false";

/**
 * An invitation is for whoever owns the address. Where addresses are
 * verified, an account that has not verified its own cannot take one.
 */
const canTakeInvites = (user: { emailVerified?: boolean | null }) =>
    !emailVerificationEnabled || user.emailVerified === true;

const refuse = (message: string): never => {
    throw new TRPCError({ code: "BAD_REQUEST", message });
};

const forbid = (message: string): never => {
    throw new TRPCError({ code: "FORBIDDEN", message });
};

export const workspacesRouter = createTRPCRouter({
    // The workspace this browser works in, the ones the user can switch to,
    // and how many invitations wait for an answer
    getCurrent: viewerProcedure.query(async ({ ctx }) => {
        const [workspaces, invitations] = await Promise.all([
            listWorkspaces(ctx.auth.user),
            canTakeInvites(ctx.auth.user)
                ? prisma.workspaceInvite.count({
                      where: { email: normalizeInviteEmail(ctx.auth.user.email) },
                  })
                : 0,
        ]);

        return {
            current: {
                id: ctx.workspace.id,
                name: ctx.workspace.name,
                role: ctx.workspace.role,
                personal: ctx.workspace.personal,
            },
            workspaces,
            invitations,
        };
    }),

    // The members of the current workspace. Everyone in it sees who else
    // is; the pending invitations are for those who manage members.
    getMembers: viewerProcedure.query(async ({ ctx }) => {
        const canManage = canManageMember({
            actor: ctx.workspace.role,
            target: "VIEWER",
            next: "VIEWER",
        });

        const [members, invites] = await Promise.all([
            prisma.workspaceMember.findMany({
                where: { workspaceId: ctx.workspace.id },
                orderBy: { createdAt: "asc" },
                select: {
                    id: true,
                    role: true,
                    createdAt: true,
                    user: { select: { id: true, name: true, email: true } },
                },
            }),
            canManage
                ? prisma.workspaceInvite.findMany({
                      where: { workspaceId: ctx.workspace.id },
                      orderBy: { createdAt: "asc" },
                      select: { id: true, email: true, role: true, createdAt: true },
                  })
                : [],
        ]);

        return {
            canManage,
            members: members.map((member) => {
                const role =
                    member.user.id === ctx.workspace.ownerId
                        ? "OWNER"
                        : isWorkspaceRole(member.role) && member.role !== "OWNER"
                            ? member.role
                            : "VIEWER";

                return {
                    id: member.id,
                    name: member.user.name,
                    email: member.user.email,
                    role,
                    isYou: member.user.id === ctx.auth.user.id,
                    joinedAt: member.createdAt,
                    // Which roles the caller may give this member, and whether
                    // they may remove them
                    assignable: ASSIGNABLE_ROLES.filter((next) =>
                        canManageMember({ actor: ctx.workspace.role, target: role, next })
                    ),
                    removable:
                        member.user.id !== ctx.auth.user.id &&
                        canManageMember({ actor: ctx.workspace.role, target: role, next: null }),
                };
            }),
            invites,
        };
    }),

    rename: workspaceAdminProcedure
        .input(z.object({ name: z.string().trim().min(1, "Name the workspace").max(80) }))
        .mutation(async ({ ctx, input }) => {
            await prisma.workspace.update({
                where: { id: ctx.workspace.id },
                data: { name: input.name },
            });

            await recordAudit({
                userId: ctx.workspace.ownerId,
                actor: ctx.workspace.actor,
                action: "workspace.renamed",
                target: `Workspace "${input.name}"`,
            });

            return { name: input.name };
        }),

    // Asks someone to join, by email. Nothing is said about whether the
    // address has an account: the invitation waits until its owner signs in.
    invite: workspaceAdminProcedure
        .input(
            z.object({
                email: z.string().trim().email("Enter an email address").max(254),
                role: z.enum(ASSIGNABLE_ROLES),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const email = normalizeInviteEmail(input.email);

            // Only the owner decides who is an admin
            if (!canManageMember({ actor: ctx.workspace.role, target: "VIEWER", next: input.role })) {
                forbid(roleError(ctx.workspace.role, "OWNER"));
            }

            if (email === normalizeInviteEmail(ctx.auth.user.email)) {
                refuse("That is your own address.");
            }

            const member = await prisma.workspaceMember.findFirst({
                where: {
                    workspaceId: ctx.workspace.id,
                    user: { email: { equals: email, mode: "insensitive" } },
                },
                select: { id: true },
            });

            if (member) refuse("That person is already a member of this workspace.");

            const pending = await prisma.workspaceInvite.count({
                where: { workspaceId: ctx.workspace.id },
            });

            if (pending >= MAX_PENDING_INVITES) {
                refuse(`A workspace can have ${MAX_PENDING_INVITES} invitations waiting. Cancel one first.`);
            }

            // Asked twice: the role of the invitation that waits is changed
            await prisma.workspaceInvite.upsert({
                where: { workspaceId_email: { workspaceId: ctx.workspace.id, email } },
                update: { role: input.role, invitedById: ctx.auth.user.id },
                create: {
                    workspaceId: ctx.workspace.id,
                    email,
                    role: input.role,
                    invitedById: ctx.auth.user.id,
                },
            });

            await recordAudit({
                userId: ctx.workspace.ownerId,
                actor: ctx.workspace.actor,
                action: "workspace.member_invited",
                target: `${email} as ${input.role}`,
            });

            return { email };
        }),

    cancelInvite: workspaceAdminProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            // Of this workspace: another workspace's id removes nothing
            const removed = await prisma.workspaceInvite.deleteMany({
                where: { id: input.id, workspaceId: ctx.workspace.id },
            });

            if (removed.count === 0) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found." });
            }

            return { id: input.id };
        }),

    setRole: workspaceAdminProcedure
        .input(z.object({ memberId: z.string(), role: z.enum(ASSIGNABLE_ROLES) }))
        .mutation(async ({ ctx, input }) => {
            const member = await prisma.workspaceMember.findFirst({
                where: { id: input.memberId, workspaceId: ctx.workspace.id },
                select: { id: true, role: true, userId: true, user: { select: { email: true } } },
            });

            if (!member) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Member not found." });
            }

            const target = member.userId === ctx.workspace.ownerId ? "OWNER" : member.role;

            if (
                member.userId === ctx.auth.user.id ||
                !canManageMember({ actor: ctx.workspace.role, target, next: input.role })
            ) {
                forbid("You cannot change this member's role.");
            }

            await prisma.workspaceMember.update({
                where: { id: member.id },
                data: { role: input.role },
            });

            await recordAudit({
                userId: ctx.workspace.ownerId,
                actor: ctx.workspace.actor,
                action: "workspace.member_role_changed",
                target: `${member.user.email}: ${target} to ${input.role}`,
            });

            return { id: member.id, role: input.role };
        }),

    removeMember: workspaceAdminProcedure
        .input(z.object({ memberId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const member = await prisma.workspaceMember.findFirst({
                where: { id: input.memberId, workspaceId: ctx.workspace.id },
                select: { id: true, role: true, userId: true, user: { select: { email: true } } },
            });

            if (!member) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Member not found." });
            }

            const target = member.userId === ctx.workspace.ownerId ? "OWNER" : member.role;

            if (
                member.userId === ctx.auth.user.id ||
                !canManageMember({ actor: ctx.workspace.role, target, next: null })
            ) {
                forbid("You cannot remove this member.");
            }

            // What the member built stays: it is the workspace's
            await prisma.workspaceMember.delete({ where: { id: member.id } });

            await recordAudit({
                userId: ctx.workspace.ownerId,
                actor: ctx.workspace.actor,
                action: "workspace.member_removed",
                target: member.user.email,
            });

            return { id: member.id };
        }),

    // THE USER'S OWN: these are about the signed-in user, whatever
    // workspace the browser is in

    // Leaves a workspace the user is a member of. Their own cannot be left.
    leave: protectedProcedure
        .input(z.object({ workspaceId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const left = await prisma.workspaceMember.deleteMany({
                where: {
                    workspaceId: input.workspaceId,
                    userId: ctx.auth.user.id,
                    workspace: { ownerId: { not: ctx.auth.user.id } },
                },
            });

            if (left.count === 0) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found." });
            }

            return { workspaceId: input.workspaceId };
        }),

    // Invitations sent to the user's address
    getInvitations: protectedProcedure.query(async ({ ctx }) => {
        if (!canTakeInvites(ctx.auth.user)) return [];

        const invites = await prisma.workspaceInvite.findMany({
            where: { email: normalizeInviteEmail(ctx.auth.user.email) },
            orderBy: { createdAt: "asc" },
            select: {
                id: true,
                role: true,
                workspace: {
                    select: { name: true, owner: { select: { name: true, email: true } } },
                },
            },
        });

        return invites.map((invite) => ({
            id: invite.id,
            role: invite.role,
            workspace: invite.workspace.name,
            owner: invite.workspace.owner.name || invite.workspace.owner.email,
        }));
    }),

    // Accepts or declines an invitation. Only one sent to the user's own
    // address is found.
    answerInvitation: protectedProcedure
        .input(z.object({ id: z.string(), accept: z.boolean() }))
        .mutation(async ({ ctx, input }) => {
            const invite = canTakeInvites(ctx.auth.user)
                ? await prisma.workspaceInvite.findFirst({
                      where: {
                          id: input.id,
                          email: normalizeInviteEmail(ctx.auth.user.email),
                      },
                      select: {
                          id: true,
                          role: true,
                          workspaceId: true,
                          workspace: { select: { ownerId: true, name: true } },
                      },
                  })
                : null;

            if (!invite) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found." });
            }

            if (input.accept) {
                // A role that is not one a member can have gives the least
                const role = (ASSIGNABLE_ROLES as readonly string[]).includes(invite.role)
                    ? invite.role
                    : "VIEWER";

                await prisma.$transaction([
                    prisma.workspaceMember.upsert({
                        where: {
                            workspaceId_userId: {
                                workspaceId: invite.workspaceId,
                                userId: ctx.auth.user.id,
                            },
                        },
                        // Already a member: the role they have stays
                        update: {},
                        create: {
                            workspaceId: invite.workspaceId,
                            userId: ctx.auth.user.id,
                            role,
                        },
                    }),
                    prisma.workspaceInvite.delete({ where: { id: invite.id } }),
                ]);

                await recordAudit({
                    userId: invite.workspace.ownerId,
                    actor: ctx.auth.user.email,
                    action: "workspace.member_joined",
                    target: `Workspace "${invite.workspace.name}" as ${role}`,
                });
            } else {
                await prisma.workspaceInvite.delete({ where: { id: invite.id } });
            }

            return {
                workspaceId: invite.workspaceId,
                workspace: invite.workspace.name,
                accepted: input.accept,
            };
        }),
});
