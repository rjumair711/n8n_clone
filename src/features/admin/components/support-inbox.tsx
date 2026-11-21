"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ExternalLinkIcon, InboxIcon, KeyRoundIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { getNodeLabel } from "@/config/node-labels";
import {
    SUPPORT_REPLY_MAX,
    SUPPORT_STATUSES,
    type SupportStatus,
} from "@/lib/support";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";

const ago = (value: Date | string) => formatDistanceToNow(new Date(value), { addSuffix: true });

// The admin's words for a status (the customer sees "Sent", "Being looked
// at", "Resolved")
const ADMIN_STATUS_LABELS: Record<SupportStatus, string> = {
    new: "New",
    in_progress: "In progress",
    resolved: "Resolved",
};

const isStatus = (value: string | null): value is SupportStatus =>
    !!value && (SUPPORT_STATUSES as readonly string[]).includes(value);

const StatusBadge = ({ status }: { status: string }) => (
    <Badge variant={status === "new" ? "default" : status === "resolved" ? "secondary" : "outline"}>
        {isStatus(status) ? ADMIN_STATUS_LABELS[status] : status}
    </Badge>
);

const MessageDetail = ({ id }: { id: string }) => {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const { data, isLoading } = useQuery(trpc.admin.supportMessage.queryOptions({ id }));
    const [reply, setReply] = useState("");
    const [resolve, setResolve] = useState(false);

    const refresh = () =>
        Promise.all([
            queryClient.invalidateQueries(trpc.admin.supportMessage.queryOptions({ id })),
            queryClient.invalidateQueries(trpc.admin.supportList.pathFilter()),
            queryClient.invalidateQueries(trpc.admin.overview.queryOptions()),
        ]);

    const send = useMutation(
        trpc.admin.reply.mutationOptions({
            onSuccess: (result) => {
                toast.success(
                    result.emailed
                        ? "Reply sent: it is in their My messages and their inbox"
                        : "Reply saved in their My messages. The email could not be sent."
                );
                setReply("");
                setResolve(false);
                refresh();
            },
            onError: (error) => toast.error(error.message),
        })
    );

    const setStatus = useMutation(
        trpc.admin.setSupportStatus.mutationOptions({
            onSuccess: () => refresh(),
            onError: (error) => toast.error(error.message),
        })
    );

    if (isLoading || !data) return <Skeleton className="h-96 rounded-xl" />;

    return (
        <div className="space-y-4">
            <Card className="shadow-none">
                <CardHeader className="space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <CardTitle className="text-base">{data.title}</CardTitle>
                        <StatusBadge status={data.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {data.name} &lt;{data.email}&gt; · {ago(data.createdAt)}
                        {data.user.email.toLowerCase() !== data.email.toLowerCase() &&
                            ` · account ${data.user.email}`}
                        {data.page && ` · from ${data.page}`}
                    </p>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="whitespace-pre-wrap text-sm">{data.message}</p>

                    {data.replies.map((item) => (
                        <div key={item.id} className="space-y-1 rounded-md border-l-2 border-primary bg-muted/40 p-3">
                            <p className="text-xs font-medium">
                                {item.admin?.name ?? "An admin"} · {ago(item.createdAt)}
                            </p>
                            <p className="whitespace-pre-wrap text-sm">{item.text}</p>
                        </div>
                    ))}

                    <form
                        className="space-y-2"
                        onSubmit={(event) => {
                            event.preventDefault();
                            send.mutate({ id: data.id, text: reply, resolve });
                        }}
                    >
                        <Label htmlFor="support-reply">Reply</Label>
                        <Textarea
                            id="support-reply"
                            rows={5}
                            maxLength={SUPPORT_REPLY_MAX}
                            placeholder={`Hi ${data.name}, ...`}
                            value={reply}
                            onChange={(event) => setReply(event.target.value)}
                        />
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <label className="flex items-center gap-2 text-sm">
                                <Checkbox checked={resolve} onCheckedChange={(value) => setResolve(value === true)} />
                                Mark as resolved
                            </label>
                            <Button type="submit" disabled={send.isPending || !reply.trim()}>
                                {send.isPending ? "Sending..." : "Send reply"}
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Shown in their Support → My messages and emailed to {data.email}.
                        </p>
                    </form>

                    <div className="flex flex-wrap gap-2 border-t pt-4">
                        {SUPPORT_STATUSES.filter((status) => status !== data.status).map((status) => (
                            <Button
                                key={status}
                                size="sm"
                                variant="outline"
                                disabled={setStatus.isPending}
                                onClick={() => setStatus.mutate({ id: data.id, status })}
                            >
                                Mark as {ADMIN_STATUS_LABELS[status].toLowerCase()}
                            </Button>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {data.workflowId && (
                <Card className="shadow-none">
                    <CardHeader>
                        <CardTitle className="text-base">
                            Workflow: {data.workflow?.name ?? data.workflowName ?? "deleted"}
                        </CardTitle>
                        {data.nodeName && (
                            <p className="text-xs text-muted-foreground">
                                About the node: {data.nodeName}
                                {data.nodeType ? ` (${getNodeLabel(data.nodeType)})` : ""}
                            </p>
                        )}
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm">
                        {!data.workflow ? (
                            <p className="text-muted-foreground">The workflow has been deleted since.</p>
                        ) : (
                            <>
                                <p className="text-xs text-muted-foreground">
                                    {data.workflow.active ? "Active" : "Not active"} · changed{" "}
                                    {ago(data.workflow.updatedAt)} · read-only: node names and types
                                    only, never their settings or credentials
                                </p>
                                <ul className="flex flex-wrap gap-1.5">
                                    {data.workflow.nodes.map((node) => (
                                        <li key={node.id}>
                                            <Badge
                                                variant={node.id === data.nodeId ? "default" : "outline"}
                                                className="gap-1 font-normal"
                                            >
                                                {node.name || getNodeLabel(node.type)}
                                                <span className="text-muted-foreground">· {getNodeLabel(node.type)}</span>
                                                {node.usesCredential && (
                                                    <KeyRoundIcon className="size-3" aria-label="uses a credential" />
                                                )}
                                            </Badge>
                                        </li>
                                    ))}
                                </ul>

                                <div className="space-y-1">
                                    <p className="text-xs font-medium">Last failed run</p>
                                    {data.workflow.lastFailedRun ? (
                                        <div className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                                            <p className="text-xs text-muted-foreground">
                                                {ago(data.workflow.lastFailedRun.startedAt)}
                                                {data.workflow.lastFailedRun.node &&
                                                    ` · at ${data.workflow.lastFailedRun.node.name} (${getNodeLabel(
                                                        data.workflow.lastFailedRun.node.type
                                                    )})`}
                                            </p>
                                            <p className="whitespace-pre-wrap break-words font-mono text-xs">
                                                {data.workflow.lastFailedRun.node?.error ??
                                                    data.workflow.lastFailedRun.error ??
                                                    "No error message was saved."}
                                            </p>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">No failed runs.</p>
                                    )}
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

/** /admin/support: the messages customers sent from RXJ. */
export const SupportInbox = () => {
    const trpc = useTRPC();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const statusParam = searchParams.get("status");
    const status = isStatus(statusParam) ? statusParam : undefined;
    const selected = searchParams.get("message");

    const { data: messages, isLoading } = useQuery({
        ...trpc.admin.supportList.queryOptions({ status }),
        refetchInterval: 60_000,
    });

    const go = (next: { status?: SupportStatus | null; message?: string | null }) => {
        const params = new URLSearchParams(searchParams.toString());
        for (const [key, value] of Object.entries(next)) {
            if (value) params.set(key, value);
            else params.delete(key);
        }
        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
                {[undefined, ...SUPPORT_STATUSES].map((value) => (
                    <Button
                        key={value ?? "all"}
                        size="sm"
                        variant={status === value ? "default" : "outline"}
                        onClick={() => go({ status: value ?? null })}
                    >
                        {value ? ADMIN_STATUS_LABELS[value] : "All"}
                    </Button>
                ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                <div className="space-y-2">
                    {isLoading ? (
                        Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-16 rounded-lg" />)
                    ) : !messages?.length ? (
                        <div className="flex flex-col items-center gap-2 rounded-xl border py-10 text-center">
                            <InboxIcon className="size-8 text-muted-foreground/40" aria-hidden />
                            <p className="text-sm text-muted-foreground">No messages here.</p>
                        </div>
                    ) : (
                        messages.map((message) => (
                            <button
                                key={message.id}
                                type="button"
                                onClick={() => go({ message: message.id })}
                                className={cn(
                                    "block w-full space-y-1 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50",
                                    selected === message.id && "border-primary bg-primary/5"
                                )}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <p className="min-w-0 truncate text-sm font-medium">{message.title}</p>
                                    <StatusBadge status={message.status} />
                                </div>
                                <p className="truncate text-xs text-muted-foreground">
                                    {message.name} · {ago(message.createdAt)}
                                    {message.workflowName ? ` · ${message.workflowName}` : ""}
                                    {message.replyCount ? ` · ${message.replyCount} repl${message.replyCount === 1 ? "y" : "ies"}` : ""}
                                </p>
                            </button>
                        ))
                    )}
                </div>

                <div>
                    {selected ? (
                        <MessageDetail key={selected} id={selected} />
                    ) : (
                        <div className="hidden rounded-xl border p-10 text-center text-sm text-muted-foreground lg:block">
                            Pick a message to read and answer it.
                        </div>
                    )}
                </div>
            </div>

            <p className="text-xs text-muted-foreground">
                Customers who write to the support email are answered from your inbox.{" "}
                <Link href="/support" className="inline-flex items-center gap-1 underline underline-offset-4">
                    What customers see <ExternalLinkIcon className="size-3" aria-hidden />
                </Link>
            </p>
        </div>
    );
};
