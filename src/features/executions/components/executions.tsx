"use client"


import { formatDistanceToNow } from "date-fns"
import { EmptyView, EntityContainer, EntityHeader, EntityItem, EntityList, EntityPagination, EntitySearch, ErrorView, LoadingView } from "@/components/entity-components"
import React from "react"
import { useRouter } from "next/navigation"
import { useExecutionsParams } from "../hooks/use-executions-params"
import { Execution, ExecutionStatus } from "@prisma/client"
import { useSuspenseExecutions } from "../hooks/use-executions"
import { CheckCircle2Icon, ClockIcon, Loader2Icon, XCircleIcon } from "lucide-react"
import { formatTriggerSource } from "@/config/trigger-sources"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useTRPC } from "@/trpc/client"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RETENTION_DAY_OPTIONS } from "@/lib/execution-retention"




export const ExecutionsList = () => {

    const executions = useSuspenseExecutions()

    return (
        <EntityList
            items={executions.data.items}
            getKey={(execution) => execution.id}
            renderItem={(execution) => <ExecutionItem data={execution} />}
            emptyView={< ExecutionEmpty />}
        />
    )
}


// The user setting "Execution data retention"
export const ExecutionRetentionSetting = () => {
    const trpc = useTRPC()
    const queryClient = useQueryClient()
    const { data } = useQuery(trpc.executions.getRetention.queryOptions())

    const setRetention = useMutation(
        trpc.executions.setRetention.mutationOptions({
            onSuccess: (saved) => {
                toast.success(`Execution data is kept for ${saved.days} days`)
                queryClient.invalidateQueries(trpc.executions.getRetention.queryOptions())
            },
            onError: (error) => toast.error(error.message),
        })
    )

    return (
        <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">Execution data retention</span>
            <Select
                value={data ? String(data.days) : undefined}
                disabled={!data || setRetention.isPending}
                onValueChange={(days) => setRetention.mutate({ days: Number(days) })}
            >
                <SelectTrigger size="sm" className="w-28">
                    <SelectValue placeholder="..." />
                </SelectTrigger>
                <SelectContent>
                    {RETENTION_DAY_OPTIONS.map((days) => (
                        <SelectItem key={days} value={String(days)}>
                            {days} days
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <span className="text-muted-foreground">
                Older executions and their node data are deleted every night.
            </span>
        </div>
    )
}

export const ExecutionsHeader = () => {
    return (
        <div className="space-y-3">
            <EntityHeader
                title="Executions"
                description="View your workflow execution history"
            />
            <ExecutionRetentionSetting />
        </div>
    )
}

export const ExecutionsPagination = () => {
    const executions = useSuspenseExecutions()
    const [params, setParams] = useExecutionsParams()


    return (
        <EntityPagination
            disabled={executions.isFetching}
            totalPages={executions.data.totalPages}
            page={executions.data.page}
            onPageChange={(page) => setParams({ ...params, page })} />
    )
}

export const ExecutionsContainer = ({
    children
}: {
    children: React.ReactNode
}) => {
    return (
        <EntityContainer
            header={<ExecutionsHeader />}
            pagination={<ExecutionsPagination />}
        >
            {children}
        </EntityContainer>
    )
}


export const ExecutionLoading = () => {
    return <LoadingView message="Loading execution..." />
}

export const ExecutionError = () => {
    return <ErrorView message="Error loading execution..." />
}

export const ExecutionEmpty = () => {
    const router = useRouter()

    const handleCreate = () => {
        router.push(`/executions/new`)
    }


    return (
        <EmptyView
            message="You haven't created any executions yet. Get started by running first workflow"
            onNew={handleCreate}
        />
    )
}

const getStatusIcon = (status: ExecutionStatus) => {
    switch (status) {
        case ExecutionStatus.SUCCESS:
            return <CheckCircle2Icon className="size-5 text-green-600" />
        case ExecutionStatus.FAILED:
            return <XCircleIcon className="size-5 text-green-600" />
        case ExecutionStatus.RUNNING:
            return <Loader2Icon className="size-5 text-green-600" />
        default:
            return <ClockIcon className="size-5 text-muted-foreground" />
    }
}

const formatStatus = (status: ExecutionStatus) => {
    return status.charAt(0) + status.slice(1).toLowerCase()
}

export const ExecutionItem = ({
    data,
}: {
    data: Execution & {
        workflow: {
            id: string;
            name: string;
        }
    }
}) => {

    const duration = data.completedAt
        ? Math.round(
            (new Date(data.completedAt).getTime() - new Date(data.startedAt).
                getTime()) / 1000,
        ) : null;

    const triggerSource = formatTriggerSource(data.triggerSource);

    const subtitle = (
        <>
            {data.workflow.name}
            {triggerSource && <> &bull; {triggerSource}</>} &bull; Started{" "}
            {formatDistanceToNow(data.startedAt, { addSuffix: true })}
            {duration !== null && <> &bull; Took {duration}s </>}
        </>
    )

    return (
        <EntityItem
            href={`/executions/${data.id}`}
            title={formatStatus(data.status)}
            subtitle={subtitle}
            image={
                <div className="size-8 flex items-center justify-center">
                    {getStatusIcon(data.status)}
                </div>
            }
        />
    )
}