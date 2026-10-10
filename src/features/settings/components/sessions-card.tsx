"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { MonitorSmartphoneIcon } from "lucide-react";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";

export const SessionsCard = () => {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const { data: sessions, isLoading } = useQuery(trpc.settings.getSessions.queryOptions());

    const refresh = () =>
        queryClient.invalidateQueries(trpc.settings.getSessions.queryOptions());

    const revokeSession = useMutation(
        trpc.settings.revokeSession.mutationOptions({
            onSuccess: () => {
                toast.success("Signed out of that session");
                refresh();
            },
            onError: (error) => toast.error(error.message),
        })
    );

    const revokeOthers = useMutation(
        trpc.settings.revokeOtherSessions.mutationOptions({
            onSuccess: () => {
                toast.success("Signed out of all other sessions");
                refresh();
            },
            onError: (error) => toast.error(error.message),
        })
    );

    const hasOthers = !!sessions?.some((session) => !session.isCurrent);
    const isPending = revokeSession.isPending || revokeOthers.isPending;

    return (
        <Card className="shadow-none">
            <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1.5">
                        <CardTitle className="text-base">Active sessions</CardTitle>
                        <CardDescription>
                            Every browser and device signed in to your account.
                        </CardDescription>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!hasOthers || isPending}
                        onClick={() => revokeOthers.mutate()}
                    >
                        Sign out all other sessions
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading sessions...</p>
                ) : (
                    <ul className="divide-y">
                        {sessions?.map((session) => (
                            <li key={session.id} className="flex items-center justify-between gap-4 py-3">
                                <div className="flex min-w-0 items-center gap-3">
                                    <MonitorSmartphoneIcon className="size-5 shrink-0 text-muted-foreground" />
                                    <div className="min-w-0">
                                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                                            {session.device}
                                            {session.isCurrent && <Badge variant="secondary">This device</Badge>}
                                        </p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {session.ipAddress || "Unknown IP address"} &bull; Last active{" "}
                                            {formatDistanceToNow(session.lastActiveAt, { addSuffix: true })}
                                        </p>
                                    </div>
                                </div>
                                {!session.isCurrent && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={isPending}
                                        onClick={() => revokeSession.mutate({ id: session.id })}
                                    >
                                        Sign out
                                    </Button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
};
