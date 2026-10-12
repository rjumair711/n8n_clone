"use client";

import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConicalIcon, PinIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useExecutionStore } from "@/features/executions/store/execution-store";
import { useTRPC } from "@/trpc/client";

// Testing one part of a workflow from the editor: pinning a node's output
// so the node is not run again, and running only a node, or a node and what
// comes after it, with the data the nodes before it already produced.

// The editor's route: /workflows/<workflowId>
const useWorkflowId = () => {
    const params = useParams<{ workflowId?: string }>();

    return typeof params?.workflowId === "string" ? params.workflowId : "";
};

/**
 * Which nodes of the open workflow have pinned data.
 */
export const usePinnedNodes = () => {
    const trpc = useTRPC();
    const workflowId = useWorkflowId();

    const { data } = useQuery({
        ...trpc.workflows.getPinnedNodes.queryOptions({ id: workflowId }),
        enabled: !!workflowId,
    });

    return data ?? [];
};

/**
 * Pins a node's output: of the given execution, or of the newest run that
 * has it.
 */
export const usePinNode = (workflowId: string) => {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    return useMutation(
        trpc.workflows.pinNode.mutationOptions({
            onSuccess: () => {
                toast.success("Output pinned: this node is not run again in test runs");
                queryClient.invalidateQueries(
                    trpc.workflows.getPinnedNodes.queryOptions({ id: workflowId })
                );
            },
            onError: (error) => toast.error(error.message),
        })
    );
};

/**
 * A small pin on a node that has pinned data, also when its toolbar is hidden.
 */
export const PinnedBadge = ({ nodeId }: { nodeId: string }) => {
    const pinned = usePinnedNodes().some((pin) => pin.nodeId === nodeId);

    return pinned ? (
        <span
            title="Pinned data: this node is not run in test runs"
            className="pointer-events-none absolute -right-1.5 -top-1.5 z-10 flex size-4 items-center justify-center rounded-full bg-violet-600 text-white shadow-sm"
        >
            <PinIcon className="size-2.5" />
        </span>
    ) : null;
};

/**
 * The toolbar button of a node: pin or unpin its output, and (not for a
 * trigger) "Run this node only" and "Run from here".
 */
export function NodeTestActions({
    nodeId,
    trigger = false,
}: {
    nodeId: string;
    // A trigger starts the whole workflow: it can be pinned, not run alone
    trigger?: boolean;
}) {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const workflowId = useWorkflowId();

    const pin = usePinnedNodes().find((entry) => entry.nodeId === nodeId);
    const pinNode = usePinNode(workflowId);

    const unpinNode = useMutation(
        trpc.workflows.unpinNode.mutationOptions({
            onSuccess: () => {
                toast.success("Unpinned: this node runs again");
                queryClient.invalidateQueries(
                    trpc.workflows.getPinnedNodes.queryOptions({ id: workflowId })
                );
            },
            onError: (error) => toast.error(error.message),
        })
    );

    const { resetExecution, setExecutionActive, setExecutionId } = useExecutionStore();

    const execute = useMutation(
        trpc.workflows.execute.mutationOptions({
            onSuccess: (data) => {
                if (data.executionId) setExecutionId(data.executionId);
            },
            onError: (error) => {
                setExecutionActive(false);
                toast.error(error.message);
            },
        })
    );

    const run = (mode: "node" | "from") => {
        // The same as the Execute button: the logs and badges start afresh
        resetExecution();
        setExecutionActive(true);
        execute.mutate({ id: workflowId, partial: { nodeId, mode } });
    };

    if (!workflowId) return null;

    const busy = pinNode.isPending || unpinNode.isPending || execute.isPending;

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    size="sm"
                    variant="ghost"
                    title="Test data: pin the output, run this node"
                    className={pin ? "text-violet-600" : undefined}
                >
                    {pin ? <PinIcon className="size-4" /> : <FlaskConicalIcon className="size-4" />}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 space-y-4" align="start">
                <div className="space-y-2">
                    <p className="text-sm font-medium">
                        {pin ? "Pinned data" : "Pin this node's output"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {pin
                            ? `Pinned on ${new Date(pin.createdAt).toLocaleString()}. In runs from the editor this node is not run: its pinned output is used.`
                            : "Keeps the output of its last run. In runs from the editor the node is then not run again: useful for a node that is slow, costs money or sends something."}{" "}
                        Live runs (webhooks, schedules, the public chat) always run every node.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            size="sm"
                            variant={pin ? "outline" : "default"}
                            disabled={busy}
                            onClick={() => pinNode.mutate({ id: workflowId, nodeId })}
                        >
                            <PinIcon className="size-3.5" />
                            {pin ? "Pin the latest output instead" : "Pin latest output"}
                        </Button>
                        {pin && (
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => unpinNode.mutate({ id: workflowId, nodeId })}
                            >
                                Unpin
                            </Button>
                        )}
                    </div>
                </div>

                {!trigger && (
                    <div className="space-y-2 border-t pt-3">
                        <p className="text-sm font-medium">Run a part of the workflow</p>
                        <p className="text-xs text-muted-foreground">
                            The nodes before this one are not run: their pinned data, or the
                            data of their last run, is used. The saved workflow runs, so save
                            your changes first.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => run("node")}>
                                Run this node only
                            </Button>
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => run("from")}>
                                Run from here
                            </Button>
                        </div>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}
