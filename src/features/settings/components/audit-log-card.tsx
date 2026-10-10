"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { useTRPC } from "@/trpc/client";
import { getAuditActionLabel } from "@/lib/audit-actions";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";

const PAGE_SIZE = 50;
// The server's own limit for one request
const MAX_ROWS = 500;

export const AuditLogCard = () => {
    const trpc = useTRPC();
    const [limit, setLimit] = useState(PAGE_SIZE);

    const { data, isLoading, isError, isFetching } = useQuery({
        ...trpc.settings.getAuditLog.queryOptions({ limit }),
        // Keeps the list in place while more lines are loaded
        placeholderData: keepPreviousData,
    });

    const items = data?.items ?? [];

    return (
        <Card className="shadow-none">
            <CardHeader>
                <CardTitle className="text-base">Audit log</CardTitle>
                <CardDescription>
                    Sign-ins and changes to credentials, API keys, workflows, templates and
                    two-factor authentication on your account, with the address they came
                    from. Lines cannot be changed or removed.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading the audit log...</p>
                ) : isError ? (
                    <p className="text-sm text-destructive">The audit log could not be loaded.</p>
                ) : items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        Nothing recorded yet. Sign-ins and changes from now on appear here.
                    </p>
                ) : (
                    <>
                        <ul className="divide-y">
                            {items.map((entry) => (
                                <li key={entry.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium">{getAuditActionLabel(entry.action)}</p>
                                        {entry.target && (
                                            <p className="break-words text-xs text-muted-foreground">{entry.target}</p>
                                        )}
                                    </div>
                                    <div className="shrink-0 text-right text-xs text-muted-foreground">
                                        <p title={format(entry.createdAt, "PPpp")}>
                                            {formatDistanceToNow(entry.createdAt, { addSuffix: true })}
                                        </p>
                                        <p>{entry.ipAddress || "Unknown IP address"}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>

                        {data?.hasMore && limit < MAX_ROWS && (
                            <Button
                                className="mt-3"
                                variant="outline"
                                size="sm"
                                disabled={isFetching}
                                onClick={() => setLimit(Math.min(limit + PAGE_SIZE, MAX_ROWS))}
                            >
                                Show more
                            </Button>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
};
