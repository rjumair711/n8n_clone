"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { LifeBuoyIcon } from "lucide-react";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import { SUPPORT_MESSAGE_MAX, SUPPORT_TITLE_MAX } from "@/lib/support";
import { useTRPC } from "@/trpc/client";

// What the message is about, when it is sent from the workflow editor
export type SupportContext = {
    workflowId?: string;
    workflowName?: string;
    nodeId?: string;
    nodeName?: string;
    nodeType?: string;
};

/**
 * "Contact support": title, message, name and email. From the editor the
 * workflow (and the selected node) go with it, and the customer is shown
 * that they do.
 */
export const SupportDialog = ({
    open,
    onOpenChange,
    context,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    context?: SupportContext;
}) => {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const pathname = usePathname();
    const { data: info } = useQuery({ ...trpc.support.info.queryOptions(), enabled: open });

    const [title, setTitle] = useState("");
    const [message, setMessage] = useState("");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");

    // From the account, once it is known; the customer may change them
    useEffect(() => {
        if (!info) return;
        setName((current) => current || info.name || "");
        setEmail((current) => current || info.email || "");
    }, [info]);

    const send = useMutation(
        trpc.support.send.mutationOptions({
            onSuccess: (result) => {
                toast.success(`Thanks, we've got your message and will reply to ${result.email}.`);
                setTitle("");
                setMessage("");
                queryClient.invalidateQueries(trpc.support.mine.queryOptions());
                onOpenChange(false);
            },
            onError: (error) => toast.error(error.message),
        })
    );

    const attached = [
        context?.workflowName ? `workflow “${context.workflowName}”` : null,
        context?.nodeName ? `node “${context.nodeName}”` : null,
    ].filter(Boolean);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <LifeBuoyIcon className="size-5" aria-hidden />
                        Contact support
                    </DialogTitle>
                    <DialogDescription>
                        Stuck with a node, a connection or a run? Tell us what happened and we will
                        reply by email and under Support → My messages.
                    </DialogDescription>
                </DialogHeader>

                <form
                    className="space-y-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        send.mutate({
                            title,
                            message,
                            name,
                            email,
                            workflowId: context?.workflowId,
                            nodeId: context?.nodeId,
                            nodeName: context?.nodeName,
                            nodeType: context?.nodeType,
                            page: pathname,
                        });
                    }}
                >
                    <div className="space-y-1.5">
                        <Label htmlFor="support-title">Title</Label>
                        <Input
                            id="support-title"
                            required
                            maxLength={SUPPORT_TITLE_MAX}
                            placeholder="e.g. Gmail node won't connect"
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="support-message">Message</Label>
                        <Textarea
                            id="support-message"
                            required
                            rows={6}
                            maxLength={SUPPORT_MESSAGE_MAX}
                            placeholder="What did you do, what did you expect, and what happened instead? Paste the error if there is one."
                            value={message}
                            onChange={(event) => setMessage(event.target.value)}
                        />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="support-name">Your name</Label>
                            <Input
                                id="support-name"
                                required
                                maxLength={100}
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="support-email">Reply to</Label>
                            <Input
                                id="support-email"
                                type="email"
                                required
                                maxLength={254}
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                            />
                        </div>
                    </div>

                    {attached.length > 0 && (
                        <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                            We&apos;ll include: {attached.join(", ")}. Your credentials are never sent.
                        </p>
                    )}

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={send.isPending}>
                            {send.isPending ? "Sending..." : "Send"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};
