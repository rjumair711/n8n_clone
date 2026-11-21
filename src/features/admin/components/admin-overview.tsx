"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ShieldAlertIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";

const Tile = ({
    label,
    value,
    href,
    highlight = false,
}: {
    label: string;
    value: number;
    href?: string;
    highlight?: boolean;
}) => {
    const body = (
        <div
            className={cn(
                "h-full rounded-xl border p-4 transition-colors",
                highlight ? "border-primary bg-primary/5" : "bg-background",
                href && "hover:bg-muted/50"
            )}
        >
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
        </div>
    );

    return href ? (
        <Link href={href} className="block h-full">
            {body}
        </Link>
    ) : (
        body
    );
};

/** /admin: the platform at a glance. */
export const AdminOverview = () => {
    const trpc = useTRPC();
    const { data, isLoading } = useQuery({
        ...trpc.admin.overview.queryOptions(),
        refetchInterval: 60_000,
    });

    if (isLoading || !data) {
        return (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-busy="true" aria-label="Loading">
                {Array.from({ length: 7 }, (_, index) => (
                    <Skeleton key={index} className="h-20 rounded-xl" />
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {!data.canAct && (
                <p className="flex items-start gap-2 rounded-md border p-3 text-sm">
                    <ShieldAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                    You can look around, but answering support messages needs two-factor
                    authentication. Turn it on in Settings → Security.
                </p>
            )}

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Tile
                    label="New support messages"
                    value={data.newSupport}
                    href="/admin/support?status=new"
                    highlight={data.newSupport > 0}
                />
                <Tile label="Open support messages" value={data.openSupport} href="/admin/support" />
                <Tile label="Accounts" value={data.accounts} />
                <Tile label="Sign-ups this week" value={data.signupsThisWeek} />
                <Tile label="Active workflows" value={data.activeWorkflows} />
                <Tile label="Runs this month" value={data.runsThisMonth} />
                <Tile label="Failed runs, last 24 hours" value={data.failedRunsLast24h} />
            </div>
        </div>
    );
};
