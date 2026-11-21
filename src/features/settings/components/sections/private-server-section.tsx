"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { CopyIcon, ServerIcon, TerminalIcon } from "lucide-react";
import Link from "next/link";
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
import { SELF_HOSTED } from "@/config/self-hosted";
import { useTRPC } from "@/trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/trpc/routers/_app";
import { SectionNote, SectionSkeleton } from "../settings-section";

type Server = inferRouterOutputs<AppRouter>["managedServers"]["mine"]["servers"][number];

export const STATE_LABELS: Record<Server["state"], { label: string; tone: "default" | "secondary" | "destructive" | "outline" }> = {
    "waiting-for-install": { label: "Waiting for install", tone: "secondary" },
    online: { label: "Online", tone: "default" },
    offline: { label: "Not reporting", tone: "destructive" },
    canceled: { label: "Subscription ended", tone: "outline" },
};

export const ago = (value: Date | string | null) =>
    value ? formatDistanceToNow(new Date(value), { addSuffix: true }) : "Never";

const copy = async (value: string) => {
    try {
        await navigator.clipboard.writeText(value);
        toast.success("Install command copied");
    } catch {
        toast.error("Could not copy: select the command and copy it by hand");
    }
};

const Detail = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="space-y-0.5">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="text-sm">{children}</dd>
    </div>
);

const ServerCard = ({ server }: { server: Server }) => {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const [domain, setDomain] = useState(server.domain ?? "");
    const [email, setEmail] = useState(server.customerEmail);
    // Shown once: only the token's hash is kept
    const [command, setCommand] = useState<string | null>(null);

    const create = useMutation(
        trpc.managedServers.createInstallCommand.mutationOptions({
            onSuccess: (result) => {
                setCommand(result.command);
                queryClient.invalidateQueries(trpc.managedServers.mine.queryOptions());
            },
            onError: (error) => toast.error(error.message),
        })
    );

    const state = STATE_LABELS[server.state];
    const canInstall = server.state !== "canceled";

    return (
        <Card className="shadow-none">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div className="space-y-1.5">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <ServerIcon className="size-4" aria-hidden />
                        {server.domain ?? "Your private server"}
                    </CardTitle>
                    <CardDescription>Ordered {ago(server.createdAt)}</CardDescription>
                </div>
                <Badge variant={state.tone}>{state.label}</Badge>
            </CardHeader>
            <CardContent className="space-y-6">
                {server.installedAt && (
                    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                        <Detail label="Address">
                            {server.domain ? (
                                <a
                                    href={`https://${server.domain}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="underline underline-offset-4"
                                >
                                    Open RXJ
                                </a>
                            ) : (
                                "—"
                            )}
                        </Detail>
                        <Detail label="Last report">{ago(server.lastSeenAt)}</Detail>
                        <Detail label="Last backup">
                            <span className={server.backupStale ? "text-destructive" : undefined}>
                                {ago(server.lastBackupAt)}
                            </span>
                        </Detail>
                        <Detail label="Version">
                            <span className="font-mono text-xs">{server.version ?? "—"}</span>
                        </Detail>
                    </dl>
                )}

                {server.unhealthyContainers.length > 0 && server.state === "online" && (
                    <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                        Not running: {server.unhealthyContainers.join(", ")}. RXJ sees this on its
                        side too and will look at it.
                    </p>
                )}

                {server.state === "offline" && (
                    <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                        The server has not reported in since {ago(server.lastSeenAt)}. Check that
                        it is switched on. RXJ sees this on its side too.
                    </p>
                )}

                {canInstall && (
                    <div className="space-y-4 rounded-lg border p-4">
                        <div className="space-y-1">
                            <p className="flex items-center gap-2 text-sm font-medium">
                                <TerminalIcon className="size-4" aria-hidden />
                                {server.installedAt ? "Install again or move to a new server" : "Install it"}
                            </p>
                            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                                <li>
                                    Rent an Ubuntu 24.04 server with at least 4 GB of memory
                                    (Hetzner, DigitalOcean, Contabo…).
                                </li>
                                <li>
                                    Add a DNS <span className="font-mono">A</span> record for your
                                    domain with the server&apos;s IP address.
                                </li>
                                <li>
                                    Sign in to the server (SSH) and paste the command below. It
                                    takes about five minutes.
                                </li>
                            </ol>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label htmlFor={`domain-${server.id}`}>Domain</Label>
                                <Input
                                    id={`domain-${server.id}`}
                                    placeholder="automate.yourbusiness.com"
                                    value={domain}
                                    onChange={(event) => setDomain(event.target.value)}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor={`email-${server.id}`}>Admin email</Label>
                                <Input
                                    id={`email-${server.id}`}
                                    type="email"
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                />
                            </div>
                        </div>

                        {command ? (
                            <div className="space-y-2">
                                <div className="flex items-start gap-2">
                                    <pre className="min-w-0 flex-1 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
                                        {command}
                                    </pre>
                                    <Button size="icon" variant="outline" onClick={() => copy(command)} aria-label="Copy install command">
                                        <CopyIcon className="size-4" />
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Shown once: copy it now. Keep it private. It lets a server
                                    report as yours, nothing more.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <Button
                                    onClick={() =>
                                        create.mutate({ serverId: server.id, domain, email })
                                    }
                                    disabled={create.isPending}
                                >
                                    {server.tokenPrefix ? "Make a new install command" : "Make install command"}
                                </Button>
                                {server.tokenPrefix && (
                                    <p className="text-xs text-muted-foreground">
                                        A new command replaces the old one
                                        (<span className="font-mono">{server.tokenPrefix}…</span>). A
                                        server installed with the old one stops reporting until
                                        you run the new command on it.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

/** Settings → Account → Private server: the customer's managed servers. */
export const PrivateServerSection = () => {
    const trpc = useTRPC();
    const { data, isLoading } = useQuery({
        ...trpc.managedServers.mine.queryOptions(),
        enabled: !SELF_HOSTED,
        // The state changes on its own while the server installs
        refetchInterval: 60_000,
    });

    if (SELF_HOSTED) {
        return (
            <SectionNote title="This is your own server">
                Managed private servers are bought on the hosted RXJ app.
            </SectionNote>
        );
    }

    if (isLoading) return <SectionSkeleton rows={4} />;

    if (!data?.servers.length) {
        return (
            <SectionNote title="No private server on this account">
                Bought one? It shows up here once you are signed in with the email address you
                paid with, and that address is verified.{" "}
                <Link href="/pricing" className="underline underline-offset-4">
                    See the managed private server
                </Link>
            </SectionNote>
        );
    }

    return (
        <div className="space-y-4">
            {data.servers.map((server) => (
                <ServerCard key={server.id} server={server} />
            ))}
        </div>
    );
};
