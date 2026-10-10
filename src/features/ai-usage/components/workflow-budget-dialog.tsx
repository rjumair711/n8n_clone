"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { formatUsd } from "@/lib/ai-cost";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { BudgetForm } from "./budget-form";

/**
 * The workflow setting "Monthly AI budget": what the workflow spent on AI
 * this month, and the amount at which its AI nodes stop.
 */
export const WorkflowBudgetDialog = ({
    workflowId,
    open,
    onOpenChange,
}: {
    workflowId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) => {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const { data, isLoading, isError } = useQuery({
        ...trpc.aiUsage.getWorkflowBudget.queryOptions({ workflowId }),
        enabled: open,
    });

    const setBudget = useMutation(
        trpc.aiUsage.setWorkflowBudget.mutationOptions({
            onSuccess: (result) => {
                toast.success(
                    result.budgetCents === null
                        ? `"${result.name}" has no AI budget any more`
                        : `AI budget of "${result.name}" set to ${formatUsd(result.budgetCents / 100)} a month`
                );
                queryClient.invalidateQueries(
                    trpc.aiUsage.getWorkflowBudget.queryOptions({ workflowId })
                );
                queryClient.invalidateQueries(trpc.aiUsage.getMonthly.queryOptions());
            },
            onError: (error) => toast.error(error.message),
        })
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Monthly AI budget</DialogTitle>
                    <DialogDescription>
                        Optional. When this workflow&apos;s AI spend of the month reaches the
                        budget, its nodes that call a model stop with an error until the 1st
                        of next month (UTC). The spend is an estimate from the price table;
                        models without a price do not count.
                    </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                ) : isError || !data ? (
                    <p className="text-sm text-destructive">The budget could not be loaded.</p>
                ) : (
                    <div className="space-y-3">
                        <p className="text-sm">
                            Spent this month:{" "}
                            <span className="font-semibold tabular-nums">{formatUsd(data.spentUsd)}</span>
                            {data.budgetCents !== null && ` of ${formatUsd(data.budgetCents / 100)}`}
                        </p>
                        <BudgetForm
                            budgetCents={data.budgetCents}
                            isPending={setBudget.isPending}
                            onSave={(budgetUsd) => setBudget.mutate({ workflowId, budgetUsd })}
                        />
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};
