/**
 * Hook to fetch all workflows using suspense
 */

import { useTRPC } from "@/trpc/client"
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { toast } from "sonner";
import { useWorkflowsParams } from "./use-workflows-params";
import { useInvalidateUsage } from "@/features/subscription/hook/use-current-plan";

export const useSuspenseWorkflows = () => {
    const trpc = useTRPC()
    const [params] = useWorkflowsParams()

    return useSuspenseQuery(trpc.workflows.getMany.queryOptions(params))
};


/**
 * Sets the time zone a workflow's schedules run in (null: UTC)
 */
export const useSetWorkflowTimezone = () => {
    const queryClient = useQueryClient()
    const trpc = useTRPC()

    return useMutation(trpc.workflows.setTimezone.mutationOptions({
        onSuccess: (data) => {
            toast.success(`"${data.name}" now runs its schedules in ${data.timezone ?? "UTC"}`)
            queryClient.invalidateQueries(
                trpc.workflows.getOne.queryOptions({ id: data.id })
            )
        },
        onError: (error) => {
            toast.error(`Failed to set the time zone: ${error.message}`)
        }
    }))
}

/**
 * Downloads a workflow as a JSON file (without its secrets)
 */
export const useExportWorkflow = () => {
    const trpc = useTRPC()

    return useMutation(trpc.workflows.exportJson.mutationOptions({
        onSuccess: ({ fileName, json }) => {
            const url = URL.createObjectURL(new Blob([json], { type: "application/json" }))
            const link = document.createElement("a")
            link.href = url
            link.download = fileName
            document.body.appendChild(link)
            link.click()
            link.remove()
            URL.revokeObjectURL(url)
            toast.success(`Downloaded ${fileName}`)
        },
        onError: (error) => {
            toast.error(`Failed to export: ${error.message}`)
        }
    }))
}

/**
 * Creates a workflow from an exported JSON file
 */
export const useImportWorkflow = () => {
    const queryClient = useQueryClient()
    const trpc = useTRPC()
    const invalidateUsage = useInvalidateUsage()

    return useMutation(trpc.workflows.importJson.mutationOptions({
        onSuccess: (data) => {
            toast.success(`Workflow "${data.name}" imported`, {
                description: data.notes.length ? data.notes.join(". ") : undefined,
            })
            invalidateUsage()
            queryClient.invalidateQueries(
                trpc.workflows.getMany.queryOptions({})
            )
        },
    }))
}

/**
 * Hook to create a new workflow
 */

export const useCreateWorkflow = () => {

    const queryClient = useQueryClient()
    const trpc = useTRPC()
    const invalidateUsage = useInvalidateUsage()

    return useMutation(trpc.workflows.create.mutationOptions({
        onSuccess: (data) => {
            toast.success(`Workflow "${data.name}" created`)
            invalidateUsage()
            queryClient.invalidateQueries(
                trpc.workflows.getMany.queryOptions({})
            )
        },
        onError: (error) => {
            toast.error(`Failed to create workflow: ${error.message}`)
        }
    }))
}


/**
 * Hook to remove a workflow
 */

export const useRemoveWorkflow = () => {
    const trpc = useTRPC()
    const queryClient = useQueryClient()
    const invalidateUsage = useInvalidateUsage()


    return useMutation(
        trpc.workflows.remove.mutationOptions({
            onSuccess: (data) => {
                toast.success(`Workflow "${data.name}" removed`)
                invalidateUsage()
                queryClient.invalidateQueries(trpc.workflows.getMany.queryOptions({}))
                queryClient.invalidateQueries(trpc.workflows.getOne.queryFilter({ id: data.id }))
            }
        })
    )
}


/**
 * Hook to fetch a single workflow using suspense
 */

export const useSuspenseWorkflow = (id: string) => {
    const trpc = useTRPC()
    return useSuspenseQuery(trpc.workflows.getOne.queryOptions({ id }))
}



/**
 * Hook to activate or deactivate a workflow
 */

export const useSetWorkflowActive = () => {

    const queryClient = useQueryClient()
    const trpc = useTRPC()

    return useMutation(trpc.workflows.setActive.mutationOptions({
        onSuccess: (data) => {
            toast.success(`Workflow "${data.name}" ${data.active ? "activated" : "deactivated"}`)
            queryClient.invalidateQueries(
                trpc.workflows.getMany.queryOptions({})
            );
            queryClient.invalidateQueries(
                trpc.workflows.getOne.queryOptions({ id: data.id })
            )
        },
        onError: (error) => {
            toast.error(`Failed to update workflow: ${error.message}`)
        }
    }))
}

/**
 * Hook for the workflow setting "Don't save node input/output"
 */

export const useSetSaveExecutionData = () => {

    const queryClient = useQueryClient()
    const trpc = useTRPC()

    return useMutation(trpc.workflows.setSaveExecutionData.mutationOptions({
        onSuccess: (data) => {
            toast.success(
                data.saveExecutionData
                    ? `"${data.name}" saves node input and output again`
                    : `"${data.name}" no longer saves node input and output`
            )
            queryClient.invalidateQueries(
                trpc.workflows.getOne.queryOptions({ id: data.id })
            )
        },
        onError: (error) => {
            toast.error(`Failed to update workflow: ${error.message}`)
        }
    }))
}

/**
 * Hook to update a workflow name
 */

export const useUpdateWorkflowName = () => {

    const queryClient = useQueryClient()
    const trpc = useTRPC()

    return useMutation(trpc.workflows.updateName.mutationOptions({
        onSuccess: (data) => {
            toast.success(`Workflow "${data.name}" updated`)
            queryClient.invalidateQueries(
                trpc.workflows.getMany.queryOptions({})
            );
            queryClient.invalidateQueries(
                trpc.workflows.getOne.queryOptions({ id: data.id })
            )
        },
        onError: (error) => {
            toast.error(`Failed to update workflow: ${error.message}`)
        }
    }))
}

/**
 * Hook to update a workflow 
 */

export const useUpdateWorkflow = () => {

    const queryClient = useQueryClient()
    const trpc = useTRPC()

    return useMutation(trpc.workflows.update.mutationOptions({
        onSuccess: (data) => {
            toast.success(`Workflow "${data.name}" saved`)
            queryClient.invalidateQueries(
                trpc.workflows.getMany.queryOptions({})
            );
            queryClient.invalidateQueries(
                trpc.workflows.getOne.queryOptions({ id: data.id })
            )
            // A save that changed the workflow added a version
            queryClient.invalidateQueries(
                trpc.workflows.getVersions.queryOptions({ id: data.id })
            )
        },
        onError: (error) => {
            toast.error(`Failed to save workflow: ${error.message}`)
        }
    }))
}


/**
 * Hook to execute a workflow 
 */

export const useExecuteWorkflow = () => {

    const trpc = useTRPC()

    return useMutation(trpc.workflows.execute.mutationOptions({
        onSuccess: (data) => {
            toast.success(`Workflow "${data.name}" executed`)
        },
        onError: (error) => {
            toast.error(`Failed to execute workflow: ${error.message}`)
        }
    }))
}
