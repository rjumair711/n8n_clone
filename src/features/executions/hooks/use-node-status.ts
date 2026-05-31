"use client";

import { useExecutionStore } from "@/features/executions/store/execution-store";

export function useNodeStatus(
    nodeId: string
) {
    return useExecutionStore(
        (state) =>
            state.nodes[nodeId] ?? {
                status: "initial",
            }
    );
}