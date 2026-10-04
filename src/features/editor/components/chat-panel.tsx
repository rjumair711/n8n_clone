"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createId } from "@paralleldrive/cuid2";
import { LoaderCircle, MessageSquare, RotateCcw, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import { useExecuteWorkflow } from "@/features/workflows/hooks/use-workflows";
import { useExecutionStore } from "@/features/executions/store/execution-store";

type ChatMessage = {
    id: string;
    role: "user" | "assistant" | "error";
    content: string;
};

const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The agent writes its answer to `output`; fall back to the raw result
const readReply = (output: unknown): string => {
    if (output && typeof output === "object") {
        const reply = (output as Record<string, unknown>).output;

        if (typeof reply === "string" && reply) return reply;
    }

    return output ? JSON.stringify(output, null, 2) : "(The workflow returned no output)";
};

export const ChatPanel = ({ workflowId }: { workflowId: string }) => {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const executeWorkflow = useExecuteWorkflow();

    const { resetExecution, setExecutionActive, setExecutionId } = useExecutionStore();

    const [open, setOpen] = useState(false);
    const [sessionId, setSessionId] = useState(() => createId());
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [draft, setDraft] = useState("");
    const [isWaiting, setIsWaiting] = useState(false);

    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    }, [messages, isWaiting]);

    const addMessage = (role: ChatMessage["role"], content: string) => {
        setMessages((current) => [...current, { id: createId(), role, content }]);
    };

    // The run is asynchronous: poll the execution until it finishes
    const waitForExecution = async (executionId: string) => {
        const startedAt = Date.now();

        while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
            await wait(POLL_INTERVAL_MS);

            const execution = await queryClient.fetchQuery({
                ...trpc.executions.getOne.queryOptions({ id: executionId }),
                staleTime: 0,
            });

            if (execution.status !== "RUNNING") return execution;
        }

        throw new Error("Timed out waiting for the workflow to finish");
    };

    const handleSend = async () => {
        const message = draft.trim();
        if (!message || isWaiting) return;

        setDraft("");
        addMessage("user", message);
        setIsWaiting(true);

        // Show live node status on the canvas, like the Execute button does
        resetExecution();
        setExecutionActive(true);

        try {
            const started = await executeWorkflow.mutateAsync({
                id: workflowId,
                chat: { message, sessionId },
            });

            setExecutionId(started.executionId);

            const execution = await waitForExecution(started.executionId);

            if (execution.status === "SUCCESS") {
                addMessage("assistant", readReply(execution.output));
            } else {
                addMessage("error", execution.error || "The workflow failed");
            }
        } catch (error) {
            addMessage("error", error instanceof Error ? error.message : "Failed to run the workflow");
        } finally {
            setIsWaiting(false);
            setExecutionActive(false);
        }
    };

    const handleNewSession = () => {
        setSessionId(createId());
        setMessages([]);
    };

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button size="lg" variant="outline">
                    <MessageSquare className="size-4" />
                    Open chat
                </Button>
            </SheetTrigger>

            <SheetContent side="left" className="w-full sm:max-w-md p-0 flex flex-col h-screen bg-background">
                <div className="p-6 pb-4 border-b flex-shrink-0">
                    <SheetHeader>
                        <SheetTitle>Chat</SheetTitle>
                        <SheetDescription>
                            Each message runs the saved workflow from its Chat Trigger.
                            Save your changes before testing.
                        </SheetDescription>
                    </SheetHeader>
                    <div className="flex items-center justify-between mt-3">
                        <span className="text-xs text-muted-foreground font-mono truncate">
                            Session: {sessionId.slice(0, 12)}
                        </span>
                        <Button size="sm" variant="ghost" onClick={handleNewSession} disabled={isWaiting}>
                            <RotateCcw className="size-3.5" />
                            New session
                        </Button>
                    </div>
                </div>

                <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                    {messages.length === 0 && !isWaiting && (
                        <p className="text-sm text-muted-foreground text-center mt-10">
                            Send a message to start the conversation.
                        </p>
                    )}

                    {messages.map((message) => (
                        <div
                            key={message.id}
                            className={cn(
                                "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words",
                                message.role === "user" && "ml-auto bg-primary text-primary-foreground",
                                message.role === "assistant" && "bg-muted",
                                message.role === "error" && "bg-destructive/10 text-destructive border border-destructive/30"
                            )}
                        >
                            {message.content}
                        </div>
                    ))}

                    {isWaiting && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <LoaderCircle className="size-4 animate-spin" />
                            Running workflow...
                        </div>
                    )}
                </div>

                <div className="p-4 border-t flex-shrink-0 flex gap-2 items-end">
                    <Textarea
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder="Type a message..."
                        className="min-h-[44px] max-h-40 resize-none"
                        disabled={isWaiting}
                    />
                    <Button size="icon" onClick={handleSend} disabled={isWaiting || !draft.trim()}>
                        <SendIcon className="size-4" />
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    );
};
