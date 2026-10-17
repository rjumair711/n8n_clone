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

    // The same height while loading: nothing below it moves
    if (!data) {
        return <div className="h-9 rounded-md border border-sidebar-border" aria-hidden />;
    }

    return (
        <div className="space-y-1.5">
            <Select value={data.current.id} onValueChange={switchWorkspace}>
                <SelectTrigger
                    className="h-9 w-full border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent dark:bg-transparent [&_svg]:text-[var(--sidebar-muted)]"
                    aria-label="Workspace"
                >
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
                <Link href="/settings/workspace" className="block px-1 text-xs text-sidebar-foreground underline">
                    {data.invitations === 1
                        ? "1 workspace invitation"
                        : `${data.invitations} workspace invitations`}
                </Link>
            )}
        </div>
    );
};
