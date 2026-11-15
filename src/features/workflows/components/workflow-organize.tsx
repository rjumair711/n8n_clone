"use client"

import { useEffect, useState } from "react"
import { FolderIcon, FolderInputIcon, FolderPlusIcon, PencilIcon, TagIcon, Trash2Icon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
    DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
    FOLDER_NAME_MAX, MAX_TAGS_PER_WORKFLOW, NO_FOLDER, TAG_NAME_MAX,
} from "../lib/workflow-organize"
import {
    useCreateFolder, useDeleteFolder, useDeleteTag, useMoveWorkflow, useRenameFolder,
    useSetWorkflowTags, useWorkflowFolders,
} from "../hooks/use-workflow-folders"
import { useWorkflowsParams } from "../hooks/use-workflows-params"

const ALL = "__all"

// A dialog with one name field, for a new folder and for renaming one
const NameDialog = ({
    open, onOpenChange, title, initial, maxLength, saving, onSave,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    initial: string
    maxLength: number
    saving: boolean
    onSave: (name: string) => void
}) => {
    const [name, setName] = useState(initial)
    useEffect(() => { if (open) setName(initial) }, [open, initial])

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                <form
                    className="space-y-4"
                    onSubmit={(event) => { event.preventDefault(); if (name.trim()) onSave(name) }}
                >
                    <div className="space-y-2">
                        <Label htmlFor="folder-name">Name</Label>
                        <Input id="folder-name" value={name} maxLength={maxLength} autoFocus onChange={(event) => setName(event.target.value)} />
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={saving || !name.trim()}>Save</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

/**
 * Above the workflows list: which folder and which tag to show, and the
 * buttons to make, rename and delete folders.
 */
export const WorkflowsFilterBar = () => {
    const [params, setParams] = useWorkflowsParams()
    const lists = useWorkflowFolders()
    const createFolder = useCreateFolder()
    const renameFolder = useRenameFolder()
    const deleteFolder = useDeleteFolder()
    const deleteTag = useDeleteTag()
    const [dialog, setDialog] = useState<"new" | "rename" | null>(null)

    const folders = lists.data?.folders ?? []
    const tags = lists.data?.tags ?? []
    const currentFolder = folders.find((folder) => folder.id === params.folder)
    const currentTag = tags.find((tag) => tag.id === params.tag)

    return (
        <div className="flex flex-wrap items-center gap-2">
            <Select
                value={params.folder || ALL}
                onValueChange={(value) => setParams({ ...params, folder: value === ALL ? "" : value, page: 1 })}
            >
                <SelectTrigger className="w-full sm:w-56" aria-label="Folder">
                    <FolderIcon className="size-4" />
                    <SelectValue placeholder="All workflows" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={ALL}>All workflows</SelectItem>
                    <SelectItem value={NO_FOLDER}>Not in a folder ({lists.data?.unfiled ?? 0})</SelectItem>
                    {folders.length > 0 && <SelectSeparator />}
                    {folders.map((folder) => (
                        <SelectItem key={folder.id} value={folder.id}>{folder.name} ({folder.count})</SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <Select
                value={params.tag || ALL}
                onValueChange={(value) => setParams({ ...params, tag: value === ALL ? "" : value, page: 1 })}
            >
                <SelectTrigger className="w-full sm:w-44" aria-label="Tag">
                    <TagIcon className="size-4" />
                    <SelectValue placeholder="All tags" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={ALL}>All tags</SelectItem>
                    {tags.map((tag) => (
                        <SelectItem key={tag.id} value={tag.id}>{tag.name} ({tag.count})</SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <Button size="sm" variant="outline" onClick={() => setDialog("new")}>
                <FolderPlusIcon className="size-4" />
                New folder
            </Button>

            {currentFolder && (
                <>
                    <Button size="sm" variant="ghost" onClick={() => setDialog("rename")}>
                        <PencilIcon className="size-4" />
                        Rename
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        disabled={deleteFolder.isPending}
                        onClick={() => {
                            if (window.confirm(`Delete the folder "${currentFolder.name}"? Its ${currentFolder.count} workflows are kept, outside any folder.`)) {
                                deleteFolder.mutate({ id: currentFolder.id }, {
                                    onSuccess: () => setParams({ ...params, folder: "", page: 1 }),
                                })
                            }
                        }}
                    >
                        <Trash2Icon className="size-4" />
                        Delete folder
                    </Button>
                </>
            )}
            {currentTag && (
                <Button
                    size="sm"
                    variant="ghost"
                    disabled={deleteTag.isPending}
                    onClick={() => {
                        if (window.confirm(`Delete the tag "${currentTag.name}" from all ${currentTag.count} workflows?`)) {
                            deleteTag.mutate({ id: currentTag.id }, {
                                onSuccess: () => setParams({ ...params, tag: "", page: 1 }),
                            })
                        }
                    }}
                >
                    <Trash2Icon className="size-4" />
                    Delete tag
                </Button>
            )}

            <NameDialog
                open={dialog === "new"}
                onOpenChange={(open) => !open && setDialog(null)}
                title="New folder"
                initial=""
                maxLength={FOLDER_NAME_MAX}
                saving={createFolder.isPending}
                onSave={(name) =>
                    createFolder.mutate({ name }, {
                        onSuccess: (folder) => {
                            setDialog(null)
                            setParams({ ...params, folder: folder.id, page: 1 })
                        },
                    })
                }
            />
            <NameDialog
                open={dialog === "rename"}
                onOpenChange={(open) => !open && setDialog(null)}
                title="Rename folder"
                initial={currentFolder?.name ?? ""}
                maxLength={FOLDER_NAME_MAX}
                saving={renameFolder.isPending}
                onSave={(name) =>
                    currentFolder && renameFolder.mutate({ id: currentFolder.id, name }, { onSuccess: () => setDialog(null) })
                }
            />
        </div>
    )
}

/** The folder and tags under a workflow's name in the list. */
export const WorkflowOrganizeBadges = ({
    folder, tags,
}: {
    folder?: { id: string; name: string } | null
    tags?: { id: string; name: string }[]
}) => {
    if (!folder && !tags?.length) return null
    return (
        <span className="mt-1 flex flex-wrap items-center gap-1">
            {folder && (
                <Badge variant="outline" className="gap-1 font-normal">
                    <FolderIcon className="size-3" />
                    {folder.name}
                </Badge>
            )}
            {tags?.map((tag) => (
                <Badge key={tag.id} variant="secondary" className="font-normal">#{tag.name}</Badge>
            ))}
        </span>
    )
}

/** "Move to folder" and "Edit tags" in a workflow's row menu. */
export const WorkflowOrganizeMenuItems = ({
    workflowId, folderId, onEditTags,
}: {
    workflowId: string
    folderId: string | null
    onEditTags: () => void
}) => {
    const lists = useWorkflowFolders()
    const moveWorkflow = useMoveWorkflow()
    const folders = lists.data?.folders ?? []

    return (
        <>
            <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                    <FolderInputIcon className="size-4" />
                    Move to folder
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent onClick={(event) => event.stopPropagation()}>
                    <DropdownMenuItem
                        disabled={folderId === null}
                        onClick={(event) => { event.preventDefault(); moveWorkflow.mutate({ workflowId, folderId: null }) }}
                    >
                        Not in a folder
                    </DropdownMenuItem>
                    {folders.length > 0 && <DropdownMenuSeparator />}
                    {folders.map((folder) => (
                        <DropdownMenuItem
                            key={folder.id}
                            disabled={folder.id === folderId}
                            onClick={(event) => { event.preventDefault(); moveWorkflow.mutate({ workflowId, folderId: folder.id }) }}
                        >
                            {folder.name}
                        </DropdownMenuItem>
                    ))}
                    {folders.length === 0 && (
                        <p className="px-2 py-1.5 text-xs text-muted-foreground">No folders yet: use New folder above the list.</p>
                    )}
                </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onClick={(event) => { event.preventDefault(); onEditTags() }}>
                <TagIcon className="size-4" />
                Edit tags...
            </DropdownMenuItem>
        </>
    )
}

/** A workflow's tags, comma-separated; new names become tags. */
export const WorkflowTagsDialog = ({
    workflowId, tags, open, onOpenChange,
}: {
    workflowId: string
    tags: { id: string; name: string }[]
    open: boolean
    onOpenChange: (open: boolean) => void
}) => {
    const [value, setValue] = useState("")
    const setTags = useSetWorkflowTags()
    const lists = useWorkflowFolders()

    useEffect(() => { if (open) setValue(tags.map((tag) => tag.name).join(", ")) }, [open, tags])

    const names = value.split(",").map((name) => name.trim()).filter(Boolean)
    const known = (lists.data?.tags ?? []).filter((tag) => !names.includes(tag.name))

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent onClick={(event) => event.stopPropagation()}>
                <DialogHeader>
                    <DialogTitle>Tags</DialogTitle>
                    <DialogDescription>
                        Comma-separated, up to {MAX_TAGS_PER_WORKFLOW}, {TAG_NAME_MAX} characters each. A new name becomes a tag.
                    </DialogDescription>
                </DialogHeader>
                <form
                    className="space-y-3"
                    onSubmit={(event) => {
                        event.preventDefault()
                        setTags.mutate({ workflowId, names }, { onSuccess: () => onOpenChange(false) })
                    }}
                >
                    <Input value={value} onChange={(event) => setValue(event.target.value)} placeholder="sales, whatsapp" autoFocus />
                    {known.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {known.map((tag) => (
                                <button
                                    key={tag.id}
                                    type="button"
                                    className="rounded-full border px-2 py-0.5 text-xs hover:bg-accent"
                                    onClick={() => setValue([...names, tag.name].join(", "))}
                                >
                                    + {tag.name}
                                </button>
                            ))}
                        </div>
                    )}
                    <DialogFooter>
                        <Button type="submit" disabled={setTags.isPending}>Save</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
