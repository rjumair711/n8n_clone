import { useQuery } from "@tanstack/react-query";

export const useExecutionNodes = (
    executionId?: string,
    enabled = true
) => {

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

        refetchInterval: 500,
    });
};