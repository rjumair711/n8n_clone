"use client"

import { NodeToolbar, Position, useNodeId, useReactFlow } from "@xyflow/react"
import type { ReactNode } from "react"
import { Button } from "./ui/button";
import { BookOpenIcon, SettingsIcon, TrashIcon } from "lucide-react";
import { guideTopicForNode, guideTopicHref } from "@/features/settings/lib/guide-links";


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
    const nodeId = useNodeId();
    const { getNode } = useReactFlow();

    // The guide's topic about this node type, in a new tab so the canvas
    // (and anything not saved yet) stays as it is
    const openGuide = () => {
        const topic = guideTopicForNode(nodeId ? getNode(nodeId)?.type : undefined);
        window.open(topic ? guideTopicHref(topic) : "/settings/guide", "_blank", "noopener");
    };

    return (
        <>
            {showToolbar && (
                <NodeToolbar>
                    <Button size="sm" variant="ghost" onClick={onSettings}>
                        <SettingsIcon className="size-4" />
                    </Button>
                    {extraActions}
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={openGuide}
                        title="How this node works (Platform guide)"
                        aria-label="How this node works (Platform guide)"
                    >
                        <BookOpenIcon className="size-4" />
                    </Button>
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
