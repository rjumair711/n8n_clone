"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { formatTokens, formatUsd } from "@/lib/ai-cost";
import { BudgetForm } from "./budget-form";

const BudgetBar = ({ spentUsd, budgetCents }: { spentUsd: number; budgetCents: number }) => {
    const budgetUsd = budgetCents / 100;
    const share = Math.min(spentUsd / budgetUsd, 1);
    const usedUp = spentUsd >= budgetUsd;

    return (
        <div>
            <div className="h-2 rounded-full bg-muted">
                <div
                    className={`h-2 rounded-full ${usedUp ? "bg-destructive" : "bg-primary"}`}
                    style={{ width: `${share * 100}%` }}
                />
            </div>
            <p className={`mt-1 text-xs ${usedUp ? "text-destructive" : "text-muted-foreground"}`}>
                {formatUsd(spentUsd)} of {formatUsd(budgetUsd)}
                {usedUp && ": budget reached, AI nodes are stopped until next month"}
            </p>
        </div>
    );
};

/**
 * This month's AI spend of the account, per workflow, and the account's
 * monthly AI budget.
 */
export const AiSpendCard = () => {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const { data, isLoading, isError } = useQuery(trpc.aiUsage.getMonthly.queryOptions());

    const setBudget = useMutation(
        trpc.aiUsage.setUserBudget.mutationOptions({
            onSuccess: (result) => {
                toast.success(
                    result.budgetCents === null
                        ? "Monthly AI budget removed"
                        : `Monthly AI budget set to ${formatUsd(result.budgetCents / 100)}`
                );
                queryClient.invalidateQueries(trpc.aiUsage.getMonthly.queryOptions());
            },
            onError: (error) => toast.error(error.message),
        })
    );

    return (
        <div className="rounded-2xl border p-6">
            <h3 className="text-lg font-semibold">AI spend this month</h3>
            <p className="mt-2 text-sm text-muted-foreground">
                What the model calls of your workflows cost since the 1st (UTC), estimated
                from the tokens your providers reported. You pay your providers directly:
                their invoice is what counts.
            </p>

            {isLoading ? (
                <p className="mt-6 text-sm text-muted-foreground">Loading AI spend...</p>
            ) : isError || !data ? (
                <p className="mt-6 text-sm text-destructive">AI spend could not be loaded.</p>
            ) : (
                <div className="mt-6 space-y-6">
                    <div>
                        <p className="text-3xl font-semibold tabular-nums">
                            {formatUsd(data.costUsd)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {formatTokens(data.calls)} model call{data.calls === 1 ? "" : "s"},{" "}
                            {formatTokens(data.inputTokens)} input, {formatTokens(data.cachedInputTokens)}{" "}
                            cached and {formatTokens(data.outputTokens)} output tokens
                        </p>
                        {data.unpricedCalls > 0 && (
                            <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
                                {formatTokens(data.unpricedCalls)} call
                                {data.unpricedCalls === 1 ? " used a model" : "s used models"} with no
                                price set, so {data.unpricedCalls === 1 ? "it is" : "they are"} not in
                                this amount and do not count towards a budget.
                            </p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <p className="text-sm font-medium">Monthly AI budget</p>
                        <p className="text-xs text-muted-foreground">
                            Optional. When the month&apos;s spend reaches it, nodes that call a
                            model stop with an error until the 1st of next month.
                        </p>
                        {data.budgetCents !== null && (
                            <BudgetBar spentUsd={data.costUsd} budgetCents={data.budgetCents} />
                        )}
                        <BudgetForm
                            budgetCents={data.budgetCents}
                            isPending={setBudget.isPending}
                            onSave={(budgetUsd) => setBudget.mutate({ budgetUsd })}
                        />
                    </div>

                    {data.workflows.length > 0 && (
                        <div>
                            <p className="text-sm font-medium">By workflow</p>
                            <ul className="mt-2 divide-y">
                                {data.workflows.map((workflow) => (
                                    <li key={workflow.workflowId ?? "deleted"} className="space-y-1 py-2.5">
                                        <div className="flex items-baseline justify-between gap-4 text-sm">
                                            {workflow.workflowId ? (
                                                <Link
                                                    href={`/workflows/${workflow.workflowId}`}
                                                    className="min-w-0 truncate hover:underline"
                                                >
                                                    {workflow.name}
                                                </Link>
                                            ) : (
                                                <span className="text-muted-foreground">{workflow.name}</span>
                                            )}
                                            <span className="shrink-0 tabular-nums">
                                                {formatUsd(workflow.costUsd)}
                                            </span>
                                        </div>
                                        {workflow.budgetCents !== null && (
                                            <BudgetBar
                                                spentUsd={workflow.costUsd}
                                                budgetCents={workflow.budgetCents}
                                            />
                                        )}
                                    </li>
                                ))}
                            </ul>
                            <p className="mt-2 text-xs text-muted-foreground">
                                A workflow&apos;s own budget is set in its editor, under the settings
                                icon.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
