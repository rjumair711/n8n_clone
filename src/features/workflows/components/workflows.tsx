"use client"


import { formatDistanceToNow } from "date-fns"
import { EmptyView, EntityContainer, EntityHeader, EntityItem, EntityList, EntityPagination, EntitySearch, ErrorView, LoadingView } from "@/components/entity-components"
import { useCreateWorkflow, useDuplicateWorkflow, useRemoveWorkflow, useSuspenseWorkflows } from "../hooks/use-workflows"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import React from "react"
import { useUpgradeModal } from "@/hooks/use-upgrade-modal"
import { useRouter } from "next/navigation"
import { useWorkflowsParams } from "../hooks/use-workflows-params"
import { useEntitySearch } from "../../../hooks/use-entity-search"
import { CopyIcon, WorkflowIcon } from "lucide-react"
import { BuildWithAiButton } from "@/features/ai-builder/components/build-with-ai-button"
import { ImportWorkflowButton } from "./import-workflow-button"
import { WorkflowOrganizeBadges, WorkflowOrganizeMenuItems, WorkflowTagsDialog, WorkflowsFilterBar } from "./workflow-organize"

type Workflow = {
    id: string
    name: string
    createdAt: Date
    updatedAt: Date
    userId: string
    folderId?: string | null
    folder?: { id: string; name: string } | null
    tags?: { id: string; name: string }[]
}

export const WorkflowsSearch = () => {
    const [params, setParams] = useWorkflowsParams()
    const { searchValue, onSearchChange } = useEntitySearch({
        params,
        setParams
    })
    return (
        <EntitySearch
            value={searchValue}
            onChange={onSearchChange}
            placeholder="Search Workflows" />
    )
}


export const WorkflowsList = () => {

    const workflows = useSuspenseWorkflows()
    const [params] = useWorkflowsParams()
    // A folder, tag or search that matches nothing is not an empty account
    const filtered = !!(params.folder || params.tag || params.search)

    return (
        <EntityList
            items={workflows.data.items}
            getKey={(workflow) => workflow.id}
            renderItem={(workflow) => <WorkflowItem data={workflow} />}
            emptyView={filtered
                ? <p className="py-10 text-center text-sm text-muted-foreground">No workflows here. Pick another folder or tag, or move a workflow here from its menu.</p>
                : < WorkflowsEmpty />}
        />
    )
}


export const WorkflowsHeader = ({ disabled }: { disabled?: boolean }) => {

    const createWorkflow = useCreateWorkflow()
    const { handleError, modal } = useUpgradeModal()
    const router = useRouter()

    const handleCreate = () => {
        createWorkflow.mutate(undefined, {
            onSuccess: (data) => {
                router.push(`/workflows/${data.id}`)
            },
            onError: (error) => {
                handleError(error)
            }
        })
    }

    return (
        <>
            {modal}
            <EntityHeader
                title="Workflows"
                description="Create and manage your workflows"
                onNew={handleCreate}
                newButtonLabel="New workflow"
                disabled={disabled}
                isCreating={createWorkflow.isPending}
                actions={<><ImportWorkflowButton disabled={disabled} /><BuildWithAiButton /></>}
            />
        </>
    )
}

export const WorkflowsPagination = () => {
    const workflows = useSuspenseWorkflows()
    const [params, setParams] = useWorkflowsParams()


    return (
        <EntityPagination
            disabled={workflows.isFetching}
            totalPages={workflows.data.totalPages}
            page={workflows.data.page}
            onPageChange={(page) => setParams({ ...params, page })} />
    )
}

export const WorkflowsContainer = ({
    children
}: {
    children: React.ReactNode
}) => {
    return (
        <EntityContainer
            header={<WorkflowsHeader />}
            search={<div className="space-y-3"><WorkflowsSearch /><WorkflowsFilterBar /></div>}
            pagination={<WorkflowsPagination />}
        >
            {children}
        </EntityContainer>
    )
}


export const WorkflowsLoading = () => {
    return <LoadingView message="Loading workflows..." />
}

export const WorkflowsError = () => {
    return <ErrorView message="Error loading workflows..." />
}

export const WorkflowsEmpty = () => {
    const router = useRouter()
    const createWorkflow = useCreateWorkflow()
    const { handleError, modal } = useUpgradeModal()



    const handleCreate = () => {
        createWorkflow.mutate(undefined, {
            onError: (error) => {
                handleError(error)
            },
            onSuccess: (data) => {
                router.push(`/workflows/${data.id}`)
            },
        });
    }


    return (
        <>
            {modal}
            <EmptyView
                message="You haven't created any workflows yet. Get started by creating first workflow"
                onNew={handleCreate}
            />
        </>
    )
}



export const WorkflowItem = ({
    data,
}: {
    data: Workflow
}) => {
    const removeWorkflow = useRemoveWorkflow()
    const duplicateWorkflow = useDuplicateWorkflow()
    const { handleError, modal } = useUpgradeModal()
    const [tagsOpen, setTagsOpen] = React.useState(false)
    const handleRemove = () => {
        removeWorkflow.mutate({ id: data.id })
    }
    const handleDuplicate = () => {
        duplicateWorkflow.mutate({ id: data.id }, {
            onError: (error) => {
                if (!handleError(error)) toast.error(`Failed to duplicate: ${error.message}`)
            },
        })
    }

    return (
        <>
        {modal}
        <EntityItem
            href={`/workflows/${data.id}`}
            title={data.name}
            subtitle={
                <>
                    Updated {formatDistanceToNow(data.updatedAt, { addSuffix: true })}{" "}
                    &bull; Created{" "}
                    {formatDistanceToNow(data.createdAt, { addSuffix: true })}
                    <WorkflowOrganizeBadges folder={data.folder} tags={data.tags} />
                </>
            }
            image={
                <div className="size-8 flex items-center justify-center">
                    <WorkflowIcon className="size-5 text-muted-foreground" />
                </div>
            }
            menuItems={
                <>
                <WorkflowOrganizeMenuItems
                    workflowId={data.id}
                    folderId={data.folderId ?? null}
                    onEditTags={() => setTagsOpen(true)}
                />
                <DropdownMenuItem
                    disabled={duplicateWorkflow.isPending}
                    onClick={(event) => {
                        event.preventDefault()
                        handleDuplicate()
                    }}
                >
                    <CopyIcon className="size-4" />
                    Duplicate
                </DropdownMenuItem>
                </>
            }
            onRemove={handleRemove}
            isRemoving={removeWorkflow.isPending}
        />
        {/* Outside the row's link, so clicks in the dialog do not open the workflow */}
        <WorkflowTagsDialog
            workflowId={data.id}
            tags={data.tags ?? []}
            open={tagsOpen}
            onOpenChange={setTagsOpen}
        />
        </>
    )
}