import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getExecutionNodesInterval } from "../lib/execution-nodes-polling";

export const useExecutionNodes = (
    executionId?: string,
    enabled = true
) => {
    // The last answer that differed from the one before, and when it came.
    // The query keeps the same data object while the answer does not change
    // (structural sharing), which is how a change is seen.
    const lastChange = useRef<{ data: unknown; at: number; executionId?: string }>({
        data: undefined,
        at: Date.now(),
    });

    return useQuery({
        queryKey: [
            "execution-nodes",
            executionId,
        ],

        queryFn: async () => {

            if (!executionId) {
                return [];
            }

            const response =
                await fetch(
                    `/api/executions/${executionId}/nodes`
                );

            if (!response.ok) {
                throw new Error(
                    "Failed to fetch execution nodes"
                );
            }

            return response.json();
        },

        enabled:
            !!executionId &&
            enabled,

        // Fast while a node runs, then stops once the run has settled
        // (it used to ask every 500 ms for as long as the editor was open)
        refetchInterval: (query) => {
            const now = Date.now();
            const data = query.state.data;

            if (
                lastChange.current.executionId !== executionId ||
                lastChange.current.data !== data
            ) {
                lastChange.current = { data, at: now, executionId };
            }

            return getExecutionNodesInterval(data, lastChange.current.at, now);
        },
    });
};
