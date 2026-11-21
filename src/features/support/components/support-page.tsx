"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { CopyIcon, InboxIcon, MailIcon, SendIcon } from "lucide-react";
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
import { SUPPORT_STATUS_LABELS, type SupportStatus } from "@/lib/support";
import { useTRPC } from "@/trpc/client";
import { SupportDialog } from "./support-dialog";

const ago = (value: Date | string) => formatDistanceToNow(new Date(value), { addSuffix: true });

const statusLabel = (status: string) =>
    SUPPORT_STATUS_LABELS[status as SupportStatus] ?? status;

/** Sidebar → Support: the support email, a message form and My messages. */
export const SupportPage = () => {
    const trpc = useTRPC();
    const [open, setOpen] = useState(false);
    const { data: info } = useQuery(trpc.support.info.queryOptions());
    const { data: messages, isLoading } = useQuery(trpc.support.mine.queryOptions());

    const copyEmail = async (email: string) => {
        try {
            await navigator.clipboard.writeText(email);
            toast.success("Email address copied");
        } catch {
            toast.error("Could not copy: select the address and copy it by hand");
        }
    };

    return (
        <div className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-8">
            <div>
                <h1 className="text-lg font-semibold md:text-xl">Support</h1>
                <p className="text-sm text-muted-foreground">
                    A problem with a node, a connection or a run? Write to us; we read every message.
                </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <Card className="shadow-none">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <SendIcon className="size-4" aria-hidden />
                            Send a message
                        </CardTitle>
                        <CardDescription>
                            From here or from the Help button in the workflow editor. The answer
                            shows below and comes by email.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button onClick={() => setOpen(true)}>Send a message</Button>
                    </CardContent>
                </Card>

                {info?.supportEmail && (
                    <Card className="shadow-none">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <MailIcon className="size-4" aria-hidden />
                                Email us
                            </CardTitle>
                            <CardDescription className="break-all font-mono text-xs">
                                {info.supportEmail}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-wrap gap-2">
                            <Button variant="outline" asChild>
                                <a href={`mailto:${info.supportEmail}`}>Write an email</a>
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                aria-label="Copy email address"
                                onClick={() => copyEmail(info.supportEmail as string)}
                            >
                                <CopyIcon className="size-4" />
                            </Button>
                        </CardContent>
                    </Card>
                )}
            </div>

            <Card className="shadow-none">
                <CardHeader>
                    <CardTitle className="text-base">My messages</CardTitle>
                    <CardDescription>What you sent from RXJ, and our replies.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <p className="text-sm text-muted-foreground">Loading...</p>
                    ) : !messages?.length ? (
                        <div className="flex flex-col items-center gap-2 py-8 text-center">
                            <InboxIcon className="size-8 text-muted-foreground/40" aria-hidden />
                            <p className="text-sm text-muted-foreground">No messages yet.</p>
                        </div>
                    ) : (
                        <ul className="space-y-4">
                            {messages.map((item) => (
                                <li key={item.id} className="space-y-3 rounded-lg border p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium">{item.title}</p>
                                            <p className="text-xs text-muted-foreground">
                                                Sent {ago(item.createdAt)}
                                                {item.workflowName ? ` · ${item.workflowName}` : ""}
                                                {item.nodeName ? ` · ${item.nodeName}` : ""}
                                            </p>
                                        </div>
                                        <Badge variant={item.status === "resolved" ? "secondary" : "outline"}>
                                            {statusLabel(item.status)}
                                        </Badge>
                                    </div>
                                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                                        {item.message}
                                    </p>
                                    {item.replies.map((reply) => (
                                        <div
                                            key={reply.id}
                                            className="space-y-1 rounded-md border-l-2 border-primary bg-muted/40 p-3"
                                        >
                                            <p className="text-xs font-medium">
                                                RXJ support · {ago(reply.createdAt)}
                                            </p>
                                            <p className="whitespace-pre-wrap text-sm">{reply.text}</p>
                                        </div>
                                    ))}
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>

            <SupportDialog open={open} onOpenChange={setOpen} />
        </div>
    );
};
