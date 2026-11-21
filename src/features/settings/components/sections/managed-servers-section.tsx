"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { useTRPC } from "@/trpc/client";
import { SectionNote, SectionSkeleton } from "../settings-section";
import { STATE_LABELS, ago } from "./private-server-section";

type AssignTarget = { id: string; customerEmail: string; accountEmail: string | null };

/**
 * Links a purchase to the right RXJ account: for a buyer who paid with an
 * address other than their account's. The account must exist.
 */
const AssignDialog = ({
    server,
    onClose,
}: {
    server: AssignTarget | null;
    onClose: () => void;
}) => {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const [email, setEmail] = useState("");

    const assign = useMutation(
        trpc.managedServers.assignToAccount.mutationOptions({
            onSuccess: (result) => {
                toast.success(
                    result.emailVerified
                        ? `Assigned to ${result.email}`
                        : `Assigned to ${result.email}. That address is not verified yet.`
                );
                queryClient.invalidateQueries(trpc.managedServers.fleet.queryOptions());
                setEmail("");
                onClose();
            },
            onError: (error) => toast.error(error.message),
        })
    );

    return (
        <Dialog
            open={!!server}
            onOpenChange={(open) => {
                if (!open) {
                    setEmail("");
                    onClose();
                }
            }}
        >
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Assign to an account</DialogTitle>
                    <DialogDescription>
                        Paid with {server?.customerEmail}.{" "}
                        {server?.accountEmail
                            ? `Now linked to ${server.accountEmail}.`
                            : "Not linked to an account yet."}{" "}
                        The customer then finds it in Settings → Private server.
                    </DialogDescription>
                </DialogHeader>
                <form
                    className="space-y-2"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (server) assign.mutate({ serverId: server.id, email });
                    }}
                >
                    <Label htmlFor="assign-email">Email of the customer&apos;s RXJ account</Label>
                    <Input
                        id="assign-email"
                        type="email"
                        required
                        autoFocus
                        placeholder="customer@business.com"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                    />
                    <DialogFooter className="pt-2">
                        <Button type="submit" disabled={assign.isPending || !email.trim()}>
                            Assign
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

/**
 * Settings → Platform → Managed servers: every customer's server, for the
 * platform's admins. Problems first: a server that stopped reporting, a
 * container that is down, a backup that is two days old.
 */
export const ManagedServersSection = () => {
    const trpc = useTRPC();
    const [assigning, setAssigning] = useState<AssignTarget | null>(null);
    const { data: security, isLoading: loadingSecurity } = useQuery(
        trpc.settings.getSecurity.queryOptions()
    );
    const { data, isLoading } = useQuery({
        ...trpc.managedServers.fleet.queryOptions(),
        enabled: !!security?.isAdmin,
        refetchInterval: 60_000,
    });

    if (loadingSecurity) return <SectionSkeleton rows={4} />;

    if (!security?.isAdmin) {
        return (
            <SectionNote title="Admins only">
                The platform&apos;s admins look after every customer&apos;s private server here.
            </SectionNote>
        );
    }

    if (isLoading) return <SectionSkeleton rows={4} />;

    if (!data?.servers.length) {
        return (
            <SectionNote title="No managed servers yet">
                A row appears here when someone buys the managed private server in Polar
                (POLAR_MANAGED_SERVER_PRODUCT_ID).
            </SectionNote>
        );
    }

    const problems = (server: (typeof data.servers)[number]) => [
        ...(server.state === "offline" ? ["not reporting"] : []),
        ...(server.state === "online" && server.unhealthyContainers.length
            ? [`down: ${server.unhealthyContainers.join(", ")}`]
            : []),
        ...(server.backupStale && server.state !== "canceled" ? ["no recent backup"] : []),
    ];

    const rank = (server: (typeof data.servers)[number]) =>
        server.state === "canceled" ? 3 : problems(server).length ? 0 : server.state === "waiting-for-install" ? 1 : 2;

    const servers = [...data.servers].sort((a, b) => rank(a) - rank(b));

    return (
        <Card className="shadow-none">
            <CardContent className="overflow-x-auto p-0">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Customer</TableHead>
                            <TableHead>Domain</TableHead>
                            <TableHead>State</TableHead>
                            <TableHead>Last report</TableHead>
                            <TableHead>Last backup</TableHead>
                            <TableHead>Version</TableHead>
                            <TableHead>Problems</TableHead>
                            <TableHead />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {servers.map((server) => {
                            const state = STATE_LABELS[server.state];
                            const issues = problems(server);

                            return (
                                <TableRow key={server.id}>
                                    <TableCell>
                                        <div className="text-sm">{server.user?.email ?? server.customerEmail}</div>
                                        {!server.user && (
                                            <div className="text-xs text-muted-foreground">No account yet</div>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {server.domain ? (
                                            <a
                                                href={`https://${server.domain}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="underline underline-offset-4"
                                            >
                                                {server.domain}
                                            </a>
                                        ) : (
                                            "—"
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={state.tone}>{state.label}</Badge>
                                        {server.status !== "active" && (
                                            <div className="pt-1 text-xs text-muted-foreground">Polar: {server.status}</div>
                                        )}
                                    </TableCell>
                                    <TableCell>{ago(server.lastSeenAt)}</TableCell>
                                    <TableCell>{ago(server.lastBackupAt)}</TableCell>
                                    <TableCell className="font-mono text-xs">{server.version ?? "—"}</TableCell>
                                    <TableCell>
                                        {issues.length ? (
                                            <span className="text-sm text-destructive">{issues.join("; ")}</span>
                                        ) : (
                                            <span className="text-sm text-muted-foreground">None</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() =>
                                                setAssigning({
                                                    id: server.id,
                                                    customerEmail: server.customerEmail,
                                                    accountEmail: server.user?.email ?? null,
                                                })
                                            }
                                        >
                                            {server.user ? "Reassign" : "Assign"}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </CardContent>
            <AssignDialog server={assigning} onClose={() => setAssigning(null)} />
        </Card>
    );
};
