"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ChevronDownIcon, ExternalLinkIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { getNodeLabel } from "@/config/node-labels";
import type { ErrorRange } from "@/lib/admin-errors";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";

const ago = (value: Date | string | null) =>
    value ? formatDistanceToNow(new Date(value), { addSuffix: true }) : "—";

const RANGES: { value: ErrorRange; label: string }[] = [
    { value: "24h", label: "Last 24 hours" },
    { value: "7d", label: "Last 7 days" },
    { value: "30d", label: "Last 30 days" },
];

const nodeLabel = (name: string | null, type: string | null) =>
    name ? `${name}${type ? ` (${getNodeLabel(type)})` : ""}` : type ? getNodeLabel(type) : "the workflow";

/** One run: every node it ran, which one failed, and the errors. */
const RunDetail = ({ id }: { id: string }) => {
    const trpc = useTRPC();
    const { data, isLoading } = useQuery(trpc.admin.errorRun.queryOptions({ id }));

    if (isLoading || !data) return <Skeleton className="m-4 h-80 rounded-xl" />;

    return (
        <div className="space-y-4 px-4 pb-8 text-sm">
            <dl className="grid grid-cols-2 gap-3">
                <div>
                    <dt className="text-xs text-muted-foreground">Customer</dt>
                    <dd>{data.workflow.user.name}</dd>
                    <dd className="text-xs text-muted-foreground">{data.workflow.user.email}</dd>
                </div>
                <div>
                    <dt className="text-xs text-muted-foreground">Workflow</dt>
                    <dd>{data.workflow.name}</dd>
                    <dd className="text-xs text-muted-foreground">{data.workflow.active ? "Active" : "Not active"}</dd>
                </div>
                <div>
                    <dt className="text-xs text-muted-foreground">Started</dt>
                    <dd>{new Date(data.startedAt).toLocaleString()}</dd>
                </div>
                <div>
                    <dt className="text-xs text-muted-foreground">Started by</dt>
                    <dd>{data.triggerSource ?? "—"}</dd>
                </div>
            </dl>

            {data.error && (
                <div className="space-y-1">
                    <p className="text-xs font-medium">Run error</p>
                    <p className="whitespace-pre-wrap break-words rounded-md border border-destructive/40 bg-destructive/5 p-3 font-mono text-xs">
                        {data.error}
                    </p>
                </div>
            )}

            <div className="space-y-1">
                <p className="text-xs font-medium">Nodes, in the order they ran</p>
                <ol className="space-y-1.5">
                    {data.nodes.map((node) => (
                        <li
                            key={node.id}
                            className={cn(
                                "space-y-1 rounded-md border p-2.5",
                                node.status === "FAILED" && "border-destructive/40 bg-destructive/5"
                            )}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="min-w-0 truncate">
                                    {node.nodeName}{" "}
                                    <span className="text-xs text-muted-foreground">{getNodeLabel(node.nodeType)}</span>
                                </span>
                                <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                                    {node.durationMs != null && `${node.durationMs} ms`}
                                    <Badge variant={node.status === "FAILED" ? "destructive" : "outline"}>
                                        {node.status.toLowerCase()}
                                    </Badge>
                                </span>
                            </div>
                            {node.error && (
                                <p className="whitespace-pre-wrap break-words font-mono text-xs">{node.error}</p>
                            )}
                        </li>
                    ))}
                </ol>
                <p className="text-xs text-muted-foreground">
                    The nodes&apos; input and output are not shown here: they are the customer&apos;s data.
                </p>
            </div>
        </div>
    );
};

/** /admin/errors: what fails for customers, before they write to support. */
export const ErrorsPage = () => {
    const trpc = useTRPC();
    const [range, setRange] = useState<ErrorRange>("7d");
    const [view, setView] = useState<"customer" | "error">("customer");
    const [openCustomer, setOpenCustomer] = useState<string | null>(null);
    const [run, setRun] = useState<string | null>(null);

    const { data, isLoading } = useQuery({
        ...trpc.admin.errors.queryOptions({ range }),
        refetchInterval: 120_000,
    });

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-1.5">
                    {RANGES.map((item) => (
                        <Button
                            key={item.value}
                            size="sm"
                            variant={range === item.value ? "default" : "outline"}
                            onClick={() => setRange(item.value)}
                        >
                            {item.label}
                        </Button>
                    ))}
                </div>
                <div className="flex gap-1.5">
                    <Button size="sm" variant={view === "customer" ? "secondary" : "ghost"} onClick={() => setView("customer")}>
                        By customer
                    </Button>
                    <Button size="sm" variant={view === "error" ? "secondary" : "ghost"} onClick={() => setView("error")}>
                        By error
                    </Button>
                </div>
            </div>

            {isLoading || !data ? (
                <div className="space-y-2">
                    {Array.from({ length: 4 }, (_, index) => (
                        <Skeleton key={index} className="h-16 rounded-lg" />
                    ))}
                </div>
            ) : data.total === 0 ? (
                <div className="rounded-xl border py-10 text-center text-sm text-muted-foreground">
                    No failed runs in this time.
                </div>
            ) : view === "customer" ? (
                <ul className="space-y-2">
                    {data.byCustomer.map((customer) => {
                        const open = openCustomer === customer.user.id;
                        return (
                            <li key={customer.user.id} className="rounded-lg border">
                                <button
                                    type="button"
                                    onClick={() => setOpenCustomer(open ? null : customer.user.id)}
                                    aria-expanded={open}
                                    className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-muted/50"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium">{customer.user.name}</p>
                                        <p className="truncate text-xs text-muted-foreground">{customer.user.email}</p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                                        <span className="font-medium text-destructive">
                                            {customer.failedRuns} failed
                                        </span>
                                        <span className="hidden sm:inline">
                                            {customer.workflows} workflow{customer.workflows === 1 ? "" : "s"} · last {ago(customer.lastFailedAt)}
                                        </span>
                                        <ChevronDownIcon className={cn("size-4 transition-transform", open && "rotate-180")} />
                                    </div>
                                </button>
                                {open && (
                                    <ul className="divide-y border-t">
                                        {customer.runs.map((item) => (
                                            <li key={item.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => setRun(item.id)}
                                                    className="block w-full space-y-1 p-3 text-left hover:bg-muted/50"
                                                >
                                                    <p className="text-xs text-muted-foreground">
                                                        {item.workflowName} · at {nodeLabel(item.nodeName, item.nodeType)} · {ago(item.startedAt)}
                                                    </p>
                                                    <p className="line-clamp-2 break-words font-mono text-xs">
                                                        {item.error ?? "No error message was saved."}
                                                    </p>
                                                </button>
                                            </li>
                                        ))}
                                        {customer.failedRuns > customer.runs.length && (
                                            <li className="p-3 text-xs text-muted-foreground">
                                                and {customer.failedRuns - customer.runs.length} older ones
                                            </li>
                                        )}
                                    </ul>
                                )}
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <ul className="space-y-2">
                    {data.byError.map((group) => (
                        <li key={group.key}>
                            <button
                                type="button"
                                onClick={() => setRun(group.example.id)}
                                className="block w-full space-y-1.5 rounded-lg border p-3 text-left hover:bg-muted/50"
                            >
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <Badge variant="outline">{group.nodeType ? getNodeLabel(group.nodeType) : "Workflow"}</Badge>
                                    <span className="font-medium text-destructive">{group.failedRuns} runs</span>
                                    <span className="text-muted-foreground">
                                        {group.customers} customer{group.customers === 1 ? "" : "s"} · last {ago(group.lastFailedAt)}
                                    </span>
                                </div>
                                <p className="break-words font-mono text-xs">{group.message}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                    {group.customerList.slice(0, 5).map((user) => user.email).join(", ")}
                                    {group.customers > 5 ? ` and ${group.customers - 5} more` : ""}
                                </p>
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {data?.capped && (
                <p className="text-xs text-muted-foreground">
                    Showing the newest {data.total} failed runs; pick a shorter time to see all of it.
                </p>
            )}
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
                These are workflow runs. Crashes of the app itself are in Sentry.
                <a href="https://sentry.io" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-4">
                    Open Sentry <ExternalLinkIcon className="size-3" aria-hidden />
                </a>
            </p>

            <Sheet open={!!run} onOpenChange={(next) => !next && setRun(null)}>
                <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
                    <SheetHeader>
                        <SheetTitle>Failed run</SheetTitle>
                        <SheetDescription>What ran, and where it stopped.</SheetDescription>
                    </SheetHeader>
                    {run && <RunDetail id={run} />}
                </SheetContent>
            </Sheet>
        </div>
    );
};
