"use client"

import { NodeToolbar, Position } from "@xyflow/react"
import type { ReactNode } from "react"
import { Button } from "./ui/button";
import { SettingsIcon, TrashIcon } from "lucide-react";


interface WorkflowNodeProps {
    children: ReactNode,
    showToolbar?: boolean;
    onDelete?: () => void;
    onSettings?: () => void;
    // Extra toolbar buttons, shown between Settings and Delete
    extraActions?: ReactNode;
    name?: string;
    description?: string;
}

export function WorkflowNode({
    children,
showToolbar = true,
    onDelete,
    onSettings,
    extraActions,
    name,
    description
}: WorkflowNodeProps) {
    return (
        <>
            {showToolbar && (
                <NodeToolbar>
                    <Button size="sm" variant="ghost" onClick={onSettings}>
                        <SettingsIcon className="size-4" />
                    </Button>
                    {extraActions}
                    <Button size="sm" variant="ghost" onClick={onDelete}>
                        <TrashIcon className="size-4" />
                    </Button>
                </NodeToolbar>
            )}
            {children}
            {name && (
                <NodeToolbar
                    position={Position.Bottom}
                    isVisible
                    className="max-w-[200px] text-center"
                >
                    <p className="font-medium">{name}</p>
                    {description && (
                        <p className="text-muted-foreground truncate text-sm">{description}</p>
                    )}
                </NodeToolbar>
            )}
        </>
    )
}
