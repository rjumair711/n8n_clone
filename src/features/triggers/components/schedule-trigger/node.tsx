"use client"

import { Node, NodeProps, useReactFlow } from "@xyflow/react"
import { BaseExecutionNode } from "@/features/executions/components/base-execution-node"
import { memo, useState } from "react";
import { ScheduleDialog, ScheduleFormValues } from "./dialog";
import { useNodeStatus } from "@/features/executions/hooks/use-node-status";

type ScheduleNodeData = {
    variableName?: string;
    cronExpression?: string;
}

type ScheduleNodeType = Node<ScheduleNodeData>

export const ScheduleNode = memo((props: NodeProps<ScheduleNodeType>) => {
    const [dialogOpen, setDialogOpen] = useState(false);
    const { setNodes } = useReactFlow()
    const nodeStatus = useNodeStatus(props.id);

    const handleOpenSettings = () => setDialogOpen(true)

    const handleSubmit = (values: ScheduleFormValues) => {
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
    const description = nodeData?.cronExpression ? `Interval: ${nodeData.cronExpression}` : "Not Configured";

    return (
        <>
            <ScheduleDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                onSubmit={handleSubmit}
                defaultValues={nodeData}
            />
            <BaseExecutionNode
                {...props}
                id={props.id}
                icon="/logos/schedule-trigger.png"
                name="Schedule Trigger"
                status={nodeStatus.status}
                description={description}
                onSettings={handleOpenSettings}
                onDoubleClick={handleOpenSettings}
            />
        </>
    )
})

ScheduleNode.displayName = "ScheduleNode"