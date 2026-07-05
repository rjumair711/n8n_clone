"use client"

import { Node, NodeProps, useReactFlow } from "@xyflow/react"
import { BaseExecutionNode } from "@/features/executions/components/base-execution-node"
import { memo, useState } from "react";
import { TextFormatterDialog, TextFormatterFormValues } from "./dialog";
import { useNodeStatus } from "../../hooks/use-node-status";
import { Type } from "lucide-react"; // Import a standard text icon

type TextFormatterNodeData = TextFormatterFormValues;
type TextFormatterNodeType = Node<TextFormatterNodeData>;

export const TextFormatterNode = memo((props: NodeProps<TextFormatterNodeType>) => {
    const [dialogOpen, setDialogOpen] = useState(false);
    const { setNodes } = useReactFlow();
    const nodeStatus = useNodeStatus(props.id);

    const handleOpenSettings = () => setDialogOpen(true);

    const handleSubmit = (values: TextFormatterFormValues) => {
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
        }));
    };

    const nodeData = props.data;
    
    let description = "Not Configured";
    if (nodeData?.operation) {
        description = nodeData.operation.charAt(0).toUpperCase() + nodeData.operation.slice(1);
        if (nodeData.operation === "replace" && nodeData.searchString) {
            description = `Replace: "${nodeData.searchString}"`;
        }
    }

    return (
        <>
            <TextFormatterDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                onSubmit={handleSubmit}
                defaultValues={nodeData}
            />
            <BaseExecutionNode
                {...props}
                id={props.id}
                icon={Type} 
                name="Text Formatter"
                description={description}
                onSettings={handleOpenSettings}
                onDoubleClick={handleOpenSettings}
            />
        </>
    )
})

TextFormatterNode.displayName = "TextFormatterNode";