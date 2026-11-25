"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { CheckIcon, UserCheckIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
    MAX_APPROVAL_FIELD_CHARS,
    formatApprovalDetails,
    readApprovalFields,
} from "@/lib/approvals";

// A request's Editable Fields in text boxes, filled in; what the approver
// types is sent with Approve
const EditableFields = ({
    approvalId,
    stored,
    values,
    onChange,
}: {
    approvalId: string;
    stored: unknown;
    values: Record<string, string>;
    onChange: (name: string, value: string) => void;
}) => {
    const fields = readApprovalFields(stored);
    if (fields.length === 0) return null;

    return (
        <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
                Change the text if you like, then approve.
            </p>
            {fields.map((field) => (
                <div key={field.name} className="space-y-1">
                    <label
                        htmlFor={`${approvalId}-${field.name}`}
                        className="text-xs font-medium text-muted-foreground"
                    >
                        {field.name}
                    </label>
                    <Textarea
                        id={`${approvalId}-${field.name}`}
                        value={values[field.name] ?? field.value}
                        onChange={(event) => onChange(field.name, event.target.value)}
                        maxLength={MAX_APPROVAL_FIELD_CHARS}
                        rows={Math.min(12, Math.max(2, field.value.split("\n").length + 1))}
                        className="font-mono text-xs"
                    />
                </div>
            ))}
        </div>
    );
};

/**
 * The approval requests the user can still answer, each with Approve and
 * Reject. With an execution id, only that execution's (and nothing at all
 * when it has none).
 */
export const PendingApprovals = ({ executionId }: { executionId?: string }) => {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    // Per request: the Editable Fields the approver changed
    const [edits, setEdits] = useState<Record<string, Record<string, string>>>({});

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
                                    onClick={() =>
                                        decide.mutate({
                                            id: approval.id,
                                            decision: "approve",
                                            edits: edits[approval.id],
                                        })
                                    }
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
                        <EditableFields
                            approvalId={approval.id}
                            stored={approval.fields}
                            values={edits[approval.id] ?? {}}
                            onChange={(name, value) =>
                                setEdits((current) => ({
                                    ...current,
                                    [approval.id]: { ...current[approval.id], [name]: value },
                                }))
                            }
                        />
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
