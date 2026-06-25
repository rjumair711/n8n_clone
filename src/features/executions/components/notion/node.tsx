"use client"

import { Node, NodeProps, useReactFlow } from "@xyflow/react"
import { BaseExecutionNode } from "@/features/executions/components/base-execution-node"
import { memo, useState } from "react";
import { useNodeStatus } from "../../hooks/use-node-status";
import { NotionDialog, NotionFormValues } from "./dialog";

export type NotionOperation = "query_database" | "create_page";

export type NotionNodeData = {
    variableName?: string;
    credentialId?: string;
    operation?: NotionOperation;
    databaseId?: string;
    propertiesJson?: string;
}

type NotionNodeType = Node<NotionNodeData>

export const NotionNode = memo((props: NodeProps<NotionNodeType>) => {
    const [dialogOpen, setDialogOpen] = useState(false);
    const { setNodes } = useReactFlow()
    const nodeStatus = useNodeStatus(props.id);

    const handleOpenSettings = () => setDialogOpen(true)

    const handleSubmit = (values: NotionFormValues) => {
        setNodes((nodes) => nodes.map((node) => {
            if (node.id === props.id) {
                return {
                    ...node,
                    data: {
                        ...node.data,
                        ...values,
                    }
                }
            }
            return node;
        }))
    }

    const nodeData = props.data;
    
    // Dynamic description based on the chosen operation
    let description = "Not Configured";
    if (nodeData?.operation && nodeData?.databaseId) {
        const opLabel = nodeData.operation === "create_page" ? "Write to" : "Read from";
        description = `${opLabel} DB: ${nodeData.databaseId.slice(0, 8)}...`;
    }

    return (
        <>
            <NotionDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                onSubmit={handleSubmit}
                defaultValues={nodeData}
            />
            <BaseExecutionNode
                {...props}
                id={props.id}
                icon="/logos/notion.png"
                name="Notion"
                description={description}
                onSettings={handleOpenSettings}
                onDoubleClick={handleOpenSettings}
            />
        </>
    )
})

NotionNode.displayName = "NotionNode"