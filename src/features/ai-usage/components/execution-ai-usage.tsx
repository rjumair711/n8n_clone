"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { formatTokens, formatUsd } from "@/lib/ai-cost";
import {
    Table,
    TableBody,
    TableCell,
    TableFooter,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

/**
 * What the model calls of one execution cost: a line per node and model,
 * and the total. Shows nothing for a run that called no model.
 */
export const ExecutionAiUsage = ({
    executionId,
    isRunning,
}: {
    executionId: string;
    isRunning: boolean;
}) => {
    const trpc = useTRPC();

    const { data } = useQuery({
        ...trpc.aiUsage.getExecution.queryOptions({ executionId }),
        // Calls are added while the run goes on
        refetchInterval: isRunning ? 3000 : false,
    });

    if (!data || data.total.calls === 0) return null;

    const { nodes, total } = data;

    return (
        <div className="mt-6 rounded-md border p-4">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium">AI usage</p>
                <p className="text-sm">
                    Total cost{" "}
                    <span className="font-semibold tabular-nums">{formatUsd(total.costUsd)}</span>
                </p>
            </div>

            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Node</TableHead>
                        <TableHead>Model</TableHead>
                        <TableHead className="text-right">Calls</TableHead>
                        <TableHead className="text-right">Input</TableHead>
                        <TableHead className="text-right">Cached</TableHead>
                        <TableHead className="text-right">Output</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {nodes.map((node) => (
                        <TableRow key={`${node.nodeId}|${node.provider}|${node.model}`}>
                            <TableCell className="font-medium">
                                {node.nodeName || node.nodeId || "Unknown node"}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                                {node.provider} / {node.model}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{node.calls}</TableCell>
                            <TableCell className="text-right tabular-nums">
                                {formatTokens(node.inputTokens)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {formatTokens(node.cachedInputTokens)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {formatTokens(node.outputTokens)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {/* No price is not the same as free */}
                                {node.unpricedCalls === node.calls
                                    ? "No price"
                                    : formatUsd(node.costUsd)}
                                {node.unpricedCalls > 0 && node.unpricedCalls < node.calls && " *"}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
                <TableFooter>
                    <TableRow>
                        <TableCell colSpan={2}>Total</TableCell>
                        <TableCell className="text-right tabular-nums">{total.calls}</TableCell>
                        <TableCell className="text-right tabular-nums">
                            {formatTokens(total.inputTokens)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                            {formatTokens(total.cachedInputTokens)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                            {formatTokens(total.outputTokens)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                            {formatUsd(total.costUsd)}
                        </TableCell>
                    </TableRow>
                </TableFooter>
            </Table>

            <p className="mt-3 text-xs text-muted-foreground">
                Tokens as the provider reported them. Input excludes the cached part. An
                AI Agent&apos;s calls are one line. Cost is an estimate from the price table
                at the time of the call; your provider&apos;s invoice is what you pay.
                {total.unpricedCalls > 0 &&
                    ` ${total.unpricedCalls} call${total.unpricedCalls === 1 ? " has" : "s have"} no price and ${total.unpricedCalls === 1 ? "is" : "are"} not in the total.`}
            </p>
        </div>
    );
};
