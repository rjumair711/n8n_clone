"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
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

/**
 * Settings → Platform → Managed servers: every customer's server, for the
 * platform's admins. Problems first: a server that stopped reporting, a
 * container that is down, a backup that is two days old.
 */
export const ManagedServersSection = () => {
    const trpc = useTRPC();
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
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
};
