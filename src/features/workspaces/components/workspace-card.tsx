"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    ASSIGNABLE_ROLES,
    ROLE_DESCRIPTIONS,
    ROLE_LABELS,
    WORKSPACE_ROLES,
    isAssignableRole,
    isWorkspaceRole,
    type AssignableRole,
} from "@/lib/workspace-roles";
import { useTRPC } from "@/trpc/client";
import { switchWorkspace } from "./workspace-switcher";

/**
 * Settings: the workspace the user is working in, its members and their
 * roles, and the invitations sent to the user.
 */
export const WorkspaceCard = () => {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const currentQuery = trpc.workspaces.getCurrent.queryOptions();
    const membersQuery = trpc.workspaces.getMembers.queryOptions();
    const invitationsQuery = trpc.workspaces.getInvitations.queryOptions();

    const { data: current } = useQuery(currentQuery);
    const { data: team } = useQuery(membersQuery);
    const { data: invitations } = useQuery(invitationsQuery);

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [role, setRole] = useState<AssignableRole>("EDITOR");

    useEffect(() => {
        if (current) setName(current.current.name);
    }, [current]);

    const refresh = () => {
        queryClient.invalidateQueries(currentQuery);
        queryClient.invalidateQueries(membersQuery);
        queryClient.invalidateQueries(invitationsQuery);
    };
    const onError = (error: { message: string }) => {
        toast.error(error.message);
    };

    const rename = useMutation(
        trpc.workspaces.rename.mutationOptions({
            onSuccess: () => {
                toast.success("Workspace renamed");
                refresh();
            },
            onError,
        })
    );
    const invite = useMutation(
        trpc.workspaces.invite.mutationOptions({
            onSuccess: (sent) => {
                toast.success(`Invitation for ${sent.email} saved. They see it when they sign in.`);
                setEmail("");
                refresh();
            },
            onError,
        })
    );
    const cancelInvite = useMutation(
        trpc.workspaces.cancelInvite.mutationOptions({ onSuccess: refresh, onError })
    );
    const setMemberRole = useMutation(
        trpc.workspaces.setRole.mutationOptions({ onSuccess: refresh, onError })
    );
    const removeMember = useMutation(
        trpc.workspaces.removeMember.mutationOptions({ onSuccess: refresh, onError })
    );
    const leave = useMutation(
        trpc.workspaces.leave.mutationOptions({
            onSuccess: () => {
                // Back to the user's own workspace
                const own = current?.workspaces.find((workspace) => workspace.personal);
                if (own) switchWorkspace(own.id);
            },
            onError,
        })
    );
    const answer = useMutation(
        trpc.workspaces.answerInvitation.mutationOptions({
            onSuccess: (result) => {
                toast.success(
                    result.accepted
                        ? `You joined ${result.workspace}. Pick it in the sidebar to work in it.`
                        : "Invitation declined"
                );
                refresh();
            },
            onError,
        })
    );

    if (!current || !team) return null;

    const workspace = current.current;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Workspace and team</CardTitle>
                <CardDescription>
                    You are working in <strong>{workspace.name}</strong> as{" "}
                    {ROLE_LABELS[workspace.role]}. Workflows, credentials, executions and
                    the plan&apos;s limits belong to the workspace; switch workspaces in the
                    sidebar. Your two-factor settings, sessions and API keys are your own.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {invitations && invitations.length > 0 && (
                    <div className="space-y-2 rounded-md border p-3">
                        <p className="text-sm font-medium">Invitations for you</p>
                        {invitations.map((invitation) => (
                            <div key={invitation.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                                <span>
                                    {invitation.workspace} ({invitation.owner}) as{" "}
                                    {isWorkspaceRole(invitation.role) ? ROLE_LABELS[invitation.role] : invitation.role}
                                </span>
                                <span className="flex gap-2">
                                    <Button
                                        size="sm"
                                        disabled={answer.isPending}
                                        onClick={() => answer.mutate({ id: invitation.id, accept: true })}
                                    >
                                        Accept
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={answer.isPending}
                                        onClick={() => answer.mutate({ id: invitation.id, accept: false })}
                                    >
                                        Decline
                                    </Button>
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {team.canManage && (
                    <div className="flex flex-wrap items-end gap-2">
                        <div className="min-w-56 flex-1 space-y-1.5">
                            <Label htmlFor="workspace-name">Workspace name</Label>
                            <Input
                                id="workspace-name"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                maxLength={80}
                            />
                        </div>
                        <Button
                            variant="outline"
                            disabled={rename.isPending || !name.trim() || name.trim() === workspace.name}
                            onClick={() => rename.mutate({ name })}
                        >
                            Rename
                        </Button>
                    </div>
                )}

                <div className="space-y-2">
                    <p className="text-sm font-medium">Members</p>
                    <ul className="divide-y rounded-md border">
                        {team.members.map((member) => (
                            <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                                <div>
                                    <div className="font-medium">
                                        {member.name || member.email}
                                        {member.isYou ? " (you)" : ""}
                                    </div>
                                    <div className="text-xs text-muted-foreground">{member.email}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {member.assignable.length > 0 && !member.isYou ? (
                                        <Select
                                            value={member.role}
                                            onValueChange={(next) =>
                                                isAssignableRole(next) &&
                                                setMemberRole.mutate({ memberId: member.id, role: next })
                                            }
                                            disabled={setMemberRole.isPending}
                                        >
                                            <SelectTrigger className="w-28" aria-label={`Role of ${member.email}`}>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {/* The role they have is listed even when it is not one the caller may give */}
                                                {ASSIGNABLE_ROLES.filter(
                                                    (option) => option === member.role || member.assignable.includes(option)
                                                ).map((option) => (
                                                    <SelectItem key={option} value={option}>
                                                        {ROLE_LABELS[option]}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        <Badge variant="secondary">
                                            {isWorkspaceRole(member.role) ? ROLE_LABELS[member.role] : member.role}
                                        </Badge>
                                    )}
                                    {member.removable && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={removeMember.isPending}
                                            onClick={() => removeMember.mutate({ memberId: member.id })}
                                        >
                                            Remove
                                        </Button>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>

                {team.canManage && (
                    <div className="space-y-2">
                        <p className="text-sm font-medium">Invite someone</p>
                        <div className="flex flex-wrap items-end gap-2">
                            <div className="min-w-56 flex-1 space-y-1.5">
                                <Label htmlFor="invite-email">Email</Label>
                                <Input
                                    id="invite-email"
                                    type="email"
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                    placeholder="colleague@example.com"
                                />
                            </div>
                            <Select value={role} onValueChange={(next) => isAssignableRole(next) && setRole(next)}>
                                <SelectTrigger className="w-28" aria-label="Role">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {ASSIGNABLE_ROLES.filter(
                                        (option) => option !== "ADMIN" || workspace.role === "OWNER"
                                    ).map((option) => (
                                        <SelectItem key={option} value={option}>
                                            {ROLE_LABELS[option]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button
                                disabled={invite.isPending || !email.trim()}
                                onClick={() => invite.mutate({ email, role })}
                            >
                                Invite
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            No email is sent. The invitation waits here, and the person sees it
                            under Settings when they sign in to RXJ with that address, where
                            they accept or decline it.
                        </p>
                        {team.invites.length > 0 && (
                            <ul className="divide-y rounded-md border">
                                {team.invites.map((pending) => (
                                    <li key={pending.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                                        <span>
                                            {pending.email}{" "}
                                            <span className="text-xs text-muted-foreground">
                                                invited as{" "}
                                                {isWorkspaceRole(pending.role) ? ROLE_LABELS[pending.role] : pending.role}
                                            </span>
                                        </span>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={cancelInvite.isPending}
                                            onClick={() => cancelInvite.mutate({ id: pending.id })}
                                        >
                                            Cancel
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                <div className="space-y-1 text-xs text-muted-foreground">
                    {WORKSPACE_ROLES.map((option) => (
                        <p key={option}>
                            <span className="font-medium text-foreground">{ROLE_LABELS[option]}:</span>{" "}
                            {ROLE_DESCRIPTIONS[option]}
                        </p>
                    ))}
                </div>

                {!workspace.personal && (
                    <Button
                        variant="outline"
                        disabled={leave.isPending}
                        onClick={() => {
                            if (window.confirm(`Leave ${workspace.name}? You lose access to its workflows and credentials.`)) {
                                leave.mutate({ workspaceId: workspace.id });
                            }
                        }}
                    >
                        Leave this workspace
                    </Button>
                )}
            </CardContent>
        </Card>
    );
};
