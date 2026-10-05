

import { useTRPC } from "@/trpc/client"
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { toast } from "sonner";
import { useExecutionsParams } from "./use-executions-params";

/**
 * Hook to fetch all credentials using suspense
 */

export const useSuspenseExecutions = () => {
    const trpc = useTRPC()
    const [params] = useExecutionsParams()

    return useSuspenseQuery(trpc.executions.getMany.queryOptions(params))
};


/**
 * Hook to fetch a single execution using suspense
 */

export const useSuspenseExecution = (id: string) => {
    const trpc = useTRPC()
    return useSuspenseQuery(trpc.executions.getOne.queryOptions({ id }))
}


/**
 * Hook to run an execution again with the same starting data
 */

export const useRetryExecution = () => {
    const trpc = useTRPC()
    const queryClient = useQueryClient()

    return useMutation(trpc.executions.retry.mutationOptions({
        onSuccess: () => {
            toast.success("Execution started again")
            queryClient.invalidateQueries(trpc.executions.getMany.queryOptions({}))
        },
        onError: (error) => {
            toast.error(error.message)
        },
    }))
}
