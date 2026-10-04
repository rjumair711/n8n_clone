"use client"

import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Switch } from '@/components/ui/switch'
import { useSetWorkflowActive, useSuspenseWorkflow, useUpdateWorkflow, useUpdateWorkflowName } from '@/features/workflows/hooks/use-workflows'
import { useAtomValue } from 'jotai'
import { SaveIcon, Workflow } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { editorAtom } from '../store/atoms'



export const EditorSaveButton = ({ workflowId }: { workflowId: string }) => {

    const editor = useAtomValue(editorAtom)
    const saveWorkflow = useUpdateWorkflow()

    const handleSave = () => {
        if (!editor) {
            return;
        }

        const nodes = editor.getNodes()
        const edges = editor.getEdges()

        saveWorkflow.mutate({
            id: workflowId,
            nodes,
            edges,
        })
    }

    return (
        <div>
            <Button size="sm" onClick={handleSave} disabled={saveWorkflow.isPending}>
                <SaveIcon className='size-4' />
                Save
            </Button>
        </div>
    )
}

// Schedules and webhooks only fire while the workflow is active
export const EditorActiveToggle = ({ workflowId }: { workflowId: string }) => {
    const { data: workflow } = useSuspenseWorkflow(workflowId)
    const setActive = useSetWorkflowActive()

    return (
        <label
            className='ml-auto flex items-center gap-2 text-sm cursor-pointer select-none'
            title='Active workflows run from their schedule and webhook triggers'
        >
            <span className={workflow.active ? 'font-medium' : 'text-muted-foreground'}>
                {workflow.active ? 'Active' : 'Inactive'}
            </span>
            <Switch
                checked={workflow.active}
                disabled={setActive.isPending}
                onCheckedChange={(active) => setActive.mutate({ id: workflowId, active })}
            />
        </label>
    )
}

export const EditorNameInput = ({ workflowId }: { workflowId: string }) => {
    const { data: workflow } = useSuspenseWorkflow(workflowId)
    const updateWorkflow = useUpdateWorkflowName()


    const [isEditing, setIsEditing] = useState(false)
    const [name, setName] = useState(workflow.name)

    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (workflow.name) {
            setName(workflow.name)
        }
    }, [workflow.name])

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus()
            inputRef.current.select()
        }
    }, [isEditing])


    const handleSave = async () => {
        if (name === workflow.name) {
            setIsEditing(false)
            return
        }

        try {
            await updateWorkflow.mutateAsync({
                id: workflowId,
                name,
            })
        } catch {
            setName(workflow.name)
        } finally {
            setIsEditing(false)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleSave()
        } else if (e.key === "Escape") {
            setName(workflow.name)
            setIsEditing(false)
        }
    }

    if (isEditing) {
        return (
            <Input
                disabled={updateWorkflow.isPending}
                ref={inputRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                className="h-7 w-auto min-w-[100px] px-2"
            />
        )
    }

    return (
        <BreadcrumbItem
            onClick={() => setIsEditing(true)}
            className="transition-colors cursor-pointer hover:text-foreground">
            {workflow.name}
        </BreadcrumbItem>
    )
}


export const EditorBreadcrumbs = ({ workflowId }: { workflowId: string }) => {
    return (
        <Breadcrumb>
            <BreadcrumbList>
                <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                        <Link prefetch href="/workflows">
                            Workflows
                        </Link>
                    </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <EditorNameInput workflowId={workflowId} />
            </BreadcrumbList>
        </Breadcrumb>

    )
}

export const EditorHeader = ({ workflowId }: { workflowId: string }) => {
    return (
        <header className='flex h-14 shrink-0 items-center gap-2 border-b px-4 bg-background'>
            <SidebarTrigger />
            <div className='flex flex-row items-center justify-between gap-x-4 w-full'>
                <EditorBreadcrumbs workflowId={workflowId} />
                <EditorActiveToggle workflowId={workflowId} />
                <EditorSaveButton workflowId={workflowId} />
            </div>
        </header>
    )
}



