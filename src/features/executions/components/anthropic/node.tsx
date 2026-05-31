"use client"

import { Node, NodeProps, useReactFlow } from "@xyflow/react"
import { BaseExecutionNode } from "@/features/executions/components/base-execution-node"
import { memo, useState } from "react";
import { useNodeStatus } from "../../hooks/use-node-status";
import { AnthropicDialog, AnthropicFormValues } from "./dialog";

type AnthropicNodeData = {
    variableName?: string;
    systemPrompt?: string;
    credentialId?: string;
    userPrompt?: string;
}

type AnthropicNodeType = Node<AnthropicNodeData>

export const AnthropicNode = memo((props: NodeProps<AnthropicNodeType>) => {

    const [dialogOpen, setDialogOpen] = useState(false);
    const { setNodes } = useReactFlow()

   const nodeStatus = useNodeStatus(props.id);

    const handleOpenSettings = () => setDialogOpen(true)

    const handleSubmit = (values: AnthropicFormValues) => {
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
    const description = nodeData?.userPrompt ? `claude-3-5-sonnet: ${nodeData.userPrompt.slice(0, 50)}...` : "Not Configured";



    return (
        <>
            <AnthropicDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                onSubmit={handleSubmit}
                defaultValues={nodeData}
            />
            <BaseExecutionNode
                {...props}
                id={props.id}
                icon="/logos/anthropic.svg"
                name="Anthropic"
                status={nodeStatus.status}
                description={description}
                onSettings={handleOpenSettings}
                onDoubleClick={() => { handleOpenSettings }}
            />
        </>
    )
})

AnthropicNode.displayName = "AnthropicNode"
