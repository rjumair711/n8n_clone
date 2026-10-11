"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { CheckIcon, UserCheckIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { formatApprovalDetails } from "@/lib/approvals";

/**
 * The approval requests the user can still answer, each with Approve and
 * Reject. With an execution id, only that execution's (and nothing at all
 * when it has none).
 */
export const PendingApprovals = ({ executionId }: { executionId?: string }) => {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const { data: approvals, isLoading } = useQuery({
        ...trpc.approvals.getPending.queryOptions({ executionId }),
        // Requests arrive and expire while the page is open
        refetchInterval: 5000,
    });

    const decide = useMutation(
        trpc.approvals.decide.mutationOptions({
            onSuccess: (answered) => {
                toast.success(answered.decision === "approve" ? "Approved" : "Rejected");
            },
            onError: (error) => {
                toast.error(error.message);
            },
            onSettled: () => {
                queryClient.invalidateQueries({
                    queryKey: trpc.approvals.getPending.queryKey(),
                });
                if (executionId) {
                    queryClient.invalidateQueries(
                        trpc.executions.getOne.queryOptions({ id: executionId })
                    );
                }
            },
        })
    );

    if (executionId && !approvals?.length) return null;

    if (isLoading) {
        return <p className="text-sm text-muted-foreground">Loading approvals...</p>;
    }

    if (!approvals?.length) {
        return (
            <div className="flex flex-col items-center gap-2 rounded-md border px-4 py-12 text-center">
                <UserCheckIcon className="size-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                    Nothing is waiting for your approval.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3">
            {approvals.map((approval) => {
                const details = formatApprovalDetails(approval.details);

                return (
                    <div key={approval.id} className="rounded-md border bg-card p-4 space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1">
                                <p className="text-sm font-medium">
                                    {approval.kind === "tool"
                                        ? `An AI Agent wants to use the tool "${approval.title}"`
                                        : approval.title}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    <Link
                                        href={`/executions/${approval.executionId}`}
                                        className="hover:underline"
                                    >
                                        {approval.workflow.name}
                                    </Link>
                                    {" · asked "}
                                    {formatDistanceToNow(approval.createdAt, { addSuffix: true })}
                                    {" · expires "}
                                    {formatDistanceToNow(approval.expiresAt, { addSuffix: true })}
                                </p>
                            </div>
                            <div className="flex shrink-0 gap-2">
                                <Button
                                    size="sm"
                                    onClick={() => decide.mutate({ id: approval.id, decision: "approve" })}
                                    disabled={decide.isPending}
                                >
                                    <CheckIcon className="size-4" />
                                    Approve
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => decide.mutate({ id: approval.id, decision: "reject" })}
                                    disabled={decide.isPending}
                                >
                                    <XIcon className="size-4" />
                                    Reject
                                </Button>
                            </div>
                        </div>
                        {details && (
                            <div>
                                <p className="mb-1 text-xs font-medium text-muted-foreground">
                                    {approval.kind === "tool" ? "Arguments" : "Details"}
                                </p>
                                <pre className="max-h-60 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap break-words">
                                    {details}
                                </pre>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export const ApprovalsPage = () => (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 md:px-10 md:py-6">
        <div>
            <h1 className="text-lg font-semibold md:text-xl">Approvals</h1>
            <p className="text-xs text-muted-foreground md:text-sm">
                Requests from your workflows that wait for your answer: an AI
                Agent that wants to use a tool, or a Send and Wait for Approval
                node.
            </p>
        </div>
        <PendingApprovals />
    </div>
);
