"use client"

import { Node, NodeProps, useReactFlow } from "@xyflow/react"
import { BaseExecutionNode } from "@/features/executions/components/base-execution-node"
import { memo, useState } from "react";
import { TelegramDialog, TelegramFormValues } from "./dialog";
import { useNodeStatus } from "../../hooks/use-node-status";

type TelegramNodeData = {
    variableName?: string;
    credentialId?: string;
    chatId?: string;
    text?: string;
    parseMode?: "HTML" | "MarkdownV2" | "None";
}

type TelegramNodeType = Node<TelegramNodeData>

export const TelegramNode = memo((props: NodeProps<TelegramNodeType>) => {
    const [dialogOpen, setDialogOpen] = useState(false);
    const { setNodes } = useReactFlow()

    const nodeStatus = useNodeStatus(props.id);
    const handleOpenSettings = () => setDialogOpen(true)

    const handleSubmit = (values: TelegramFormValues) => {
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
    const description = nodeData?.chatId 
        ? `To: ${nodeData.chatId} (${nodeData.text?.slice(0, 30)}...)` 
        : "Not Configured";

    return (
        <>
            <TelegramDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                onSubmit={handleSubmit}
                defaultValues={nodeData}
            />
            <BaseExecutionNode
                {...props}
                id={props.id}
                icon="/logos/telegram.jfif"
                name="Telegram Bot"
                description={description}
                onSettings={handleOpenSettings}
                onDoubleClick={() => handleOpenSettings()}
            />
        </>
    )
})

TelegramNode.displayName = "TelegramNode"