"use client";

import { useExecutionStore } from "@/features/executions/store/execution-store";

// One object for every node that has no status yet: a new one per call
// would count as a change, and re-render every node on each store update
const INITIAL_STATUS = { status: "initial" } as const;

export function useNodeStatus(
    nodeId: string
) {
    return useExecutionStore(
        (state) => state.nodes[nodeId] ?? INITIAL_STATUS
    );
}
