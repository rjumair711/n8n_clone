"use client";

import { PLAN_LIMITS } from "@/config/plans";

import {
    getExecutionLimit,
    getWorkflowLimit,
} from "@/lib/subscription/usage";

type Props = {
    plan: keyof typeof PLAN_LIMITS;
    workflowsUsed: number;
    executionsUsed: number;
};

export const UsageCard = ({
    plan,
    workflowsUsed,
    executionsUsed,
}: Props) => {
    const workflowLimit =
        getWorkflowLimit(plan);

    const executionLimit =
        getExecutionLimit(plan);

    return (
        <div className="rounded-2xl border p-4">
            <h3 className="text-sm font-semibold text-blue-300/70">
                Usage
            </h3>

            <div className="mt-4 space-y-4">
                <div>
                    <div className="mb-1 flex items-center justify-between text-xs">
                        <span>Workflows</span>

                        <span>
                            {workflowsUsed} / {workflowLimit}
                        </span>
                    </div>

                    <div className="h-2 rounded-full bg-muted">
                        <div
                            className="h-2 rounded-full bg-primary"
                            style={{
                                width: `${workflowLimit > 0
                                    ? (workflowsUsed / workflowLimit) * 100
                                    : 0}%`,
                            }}
                        />
                    </div>
                </div>

                <div>
                    <div className="mb-1 flex items-center justify-between text-xs">
                        <span>Executions</span>

                        <span>
                            {executionsUsed} /{" "}
                            {executionLimit}
                        </span>
                    </div>

                    <div className="h-2 rounded-full bg-muted">
                        <div
                            className="h-2 rounded-full bg-primary"
                            style={{
                                width: `${executionLimit > 0
                                    ? (executionsUsed / executionLimit) * 100
                                    : 0}%`,
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};