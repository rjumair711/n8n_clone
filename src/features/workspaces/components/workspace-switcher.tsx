"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ROLE_LABELS, WORKSPACE_COOKIE } from "@/lib/workspace-roles";
import { useTRPC } from "@/trpc/client";

/**
 * Tells the server which workspace this browser works in, and loads the
 * app again in it. The cookie only picks: the server checks the membership
 * on every request.
 */
export const switchWorkspace = (workspaceId: string) => {
    document.cookie = `${WORKSPACE_COOKIE}=${encodeURIComponent(workspaceId)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    // Everything on screen belongs to the workspace that was left
    window.location.assign("/workflows");
};

/**
 * The sidebar's workspace picker: the user's own workspace and the ones
 * they are a member of, with their role in each.
 */
export const WorkspaceSwitcher = () => {
    const trpc = useTRPC();
    const { data } = useQuery(trpc.workspaces.getCurrent.queryOptions());

    if (!data) return null;

    return (
        <div className="space-y-1.5 px-3 pt-3">
            <Select value={data.current.id} onValueChange={switchWorkspace}>
                <SelectTrigger className="w-full" aria-label="Workspace">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {data.workspaces.map((workspace) => (
                        <SelectItem key={workspace.id} value={workspace.id}>
                            {workspace.name}
                            {workspace.personal ? "" : ` (${ROLE_LABELS[workspace.role]})`}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {data.invitations > 0 && (
                <Link href="/settings" className="block text-xs underline">
                    {data.invitations === 1
                        ? "1 workspace invitation"
                        : `${data.invitations} workspace invitations`}
                </Link>
            )}
        </div>
    );
};
