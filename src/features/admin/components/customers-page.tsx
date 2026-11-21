"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { getNodeLabel } from "@/config/node-labels";
import { useTRPC } from "@/trpc/client";

const ago = (value: Date | string | null) =>
    value ? formatDistanceToNow(new Date(value), { addSuffix: true }) : "Never";

const SERVER_LABELS: Record<string, string> = {
    "waiting-for-install": "Server: waiting",
    online: "Server: online",
    offline: "Server: not reporting",
    canceled: "Server: ended",
};

const CustomerDetail = ({ userId }: { userId: string }) => {
    const trpc = useTRPC();
    const { data, isLoading } = useQuery(trpc.admin.customer.queryOptions({ userId }));

    if (isLoading || !data) return <Skeleton className="m-4 h-96 rounded-xl" />;

    return (
        <div className="space-y-6 px-4 pb-8">
            <section className="space-y-2">
                <h3 className="text-sm font-medium">Workflows ({data.workflows.length})</h3>
                {data.workflows.length ? (
                    <ul className="divide-y rounded-lg border text-sm">
                        {data.workflows.map((workflow) => (
                            <li key={workflow.id} className="flex items-center justify-between gap-2 p-2.5">
                                <span className="min-w-0 truncate">{workflow.name}</span>
                                <span className="shrink-0 text-xs text-muted-foreground">
                                    {workflow.nodes} nodes · {workflow.active ? "active" : "off"} · {ago(workflow.updatedAt)}
                                </span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-muted-foreground">No workflows.</p>
                )}
            </section>

            <section className="space-y-2">
                <h3 className="text-sm font-medium">Latest failed runs</h3>
                {data.failedRuns.length ? (
                    <ul className="space-y-2">
                        {data.failedRuns.map((run) => (
                            <li key={run.id} className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5">
                                <p className="text-xs text-muted-foreground">
                                    {run.workflowName} · {ago(run.startedAt)}
                                    {run.node && ` · at ${run.node.name} (${getNodeLabel(run.node.type)})`}
                                </p>
                                <p className="whitespace-pre-wrap break-words font-mono text-xs">
                                    {run.error ?? "No error message was saved."}
                                </p>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-muted-foreground">No failed runs.</p>
                )}
            </section>

            {data.servers.length > 0 && (
                <section className="space-y-2">
                    <h3 className="text-sm font-medium">Managed servers</h3>
                    <ul className="space-y-1 text-sm">
                        {data.servers.map((server) => (
                            <li key={server.id}>
                                {server.domain ?? "Not installed yet"} ·{" "}
                                <span className="text-muted-foreground">
                                    {SERVER_LABELS[server.state] ?? server.state}, last report {ago(server.lastSeenAt)}
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <section className="space-y-2">
                <h3 className="text-sm font-medium">Support messages</h3>
                {data.messages.length ? (
                    <ul className="space-y-1 text-sm">
                        {data.messages.map((message) => (
                            <li key={message.id}>
                                <Link
                                    href={`/admin/support?message=${message.id}`}
                                    className="underline underline-offset-4"
                                >
                                    {message.title}
                                </Link>{" "}
                                <span className="text-xs text-muted-foreground">
                                    {message.status.replace("_", " ")} · {ago(message.createdAt)}
                                </span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-muted-foreground">None.</p>
                )}
            </section>
        </div>
    );
};

/** /admin/customers: every account and what it does, busiest first. */
export const CustomersPage = () => {
    const trpc = useTRPC();
    const [query, setQuery] = useState("");
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<{ id: string; name: string; email: string } | null>(null);

    // Asks the server a moment after typing stops
    useEffect(() => {
        const timer = setTimeout(() => setSearch(query.trim()), 300);
        return () => clearTimeout(timer);
    }, [query]);

    const { data, isLoading } = useQuery(
        trpc.admin.customers.queryOptions({ search: search || undefined })
    );

    return (
        <div className="space-y-4">
            <Input
                type="search"
                placeholder="Search by name or email"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="max-w-sm"
                aria-label="Search customers"
            />

            <div className="overflow-x-auto rounded-xl border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Customer</TableHead>
                            <TableHead className="text-right">Workflows</TableHead>
                            <TableHead className="text-right">Active</TableHead>
                            <TableHead className="text-right">Runs this month</TableHead>
                            <TableHead className="text-right">Failed</TableHead>
                            <TableHead>Signed up</TableHead>
                            <TableHead>Last sign-in</TableHead>
                            <TableHead />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={8}>
                                    <Skeleton className="h-24" />
                                </TableCell>
                            </TableRow>
                        ) : !data?.customers.length ? (
                            <TableRow>
                                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                                    {search ? "No account matches." : "No accounts yet."}
                                </TableCell>
                            </TableRow>
                        ) : (
                            data.customers.map((customer) => (
                                <TableRow
                                    key={customer.id}
                                    className="cursor-pointer"
                                    onClick={() =>
                                        setSelected({ id: customer.id, name: customer.name, email: customer.email })
                                    }
                                >
                                    <TableCell>
                                        <div className="text-sm font-medium">{customer.name}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {customer.email}
                                            {!customer.emailVerified && " · not verified"}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">{customer.workflows}</TableCell>
                                    <TableCell className="text-right tabular-nums">{customer.activeWorkflows}</TableCell>
                                    <TableCell className="text-right tabular-nums">{customer.runsThisMonth}</TableCell>
                                    <TableCell
                                        className={`text-right tabular-nums ${customer.failedRunsThisMonth ? "text-destructive" : ""}`}
                                    >
                                        {customer.failedRunsThisMonth}
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap text-sm">{ago(customer.createdAt)}</TableCell>
                                    <TableCell className="whitespace-nowrap text-sm">{ago(customer.lastSignInAt)}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1">
                                            {customer.openSupport > 0 && (
                                                <Badge>{customer.openSupport} open message{customer.openSupport === 1 ? "" : "s"}</Badge>
                                            )}
                                            {customer.servers.map((state, index) => (
                                                <Badge key={index} variant={state === "offline" ? "destructive" : "outline"}>
                                                    {SERVER_LABELS[state] ?? state}
                                                </Badge>
                                            ))}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {data?.capped && (
                <p className="text-xs text-muted-foreground">
                    Showing the 500 newest accounts that match; search to find others.
                </p>
            )}

            <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
                <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
                    <SheetHeader>
                        <SheetTitle>{selected?.name}</SheetTitle>
                        <SheetDescription>{selected?.email}</SheetDescription>
                    </SheetHeader>
                    {selected && <CustomerDetail userId={selected.id} />}
                </SheetContent>
            </Sheet>
        </div>
    );
};
