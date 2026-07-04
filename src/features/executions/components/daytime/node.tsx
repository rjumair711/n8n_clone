"use client"

import { Node, NodeProps, useReactFlow } from "@xyflow/react"
import { BaseExecutionNode } from "@/features/executions/components/base-execution-node"
import { memo, useState } from "react";
import { DateTimeDialog, DateTimeFormValues } from "./dialog";
import { useNodeStatus } from "../../hooks/use-node-status";

type DateTimeNodeData = DateTimeFormValues;
type DateTimeNodeType = Node<DateTimeNodeData>;

export const DateTimeNode = memo((props: NodeProps<DateTimeNodeType>) => {
    const [dialogOpen, setDialogOpen] = useState(false);
    const { setNodes } = useReactFlow();
    const nodeStatus = useNodeStatus(props.id);

    const handleOpenSettings = () => setDialogOpen(true);

    const handleSubmit = (values: DateTimeFormValues) => {
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
    
    // Create a dynamic subtitle based on the chosen operation
    let description = "Not Configured";
    if (nodeData?.operation) {
        switch(nodeData.operation) {
            case "current": description = "Get Current Time"; break;
            case "format": description = `Format: ${nodeData.formatString || "ISO"}`; break;
            case "manipulate": description = `${nodeData.action === 'add' ? 'Add' : 'Subtract'} ${nodeData.amount} ${nodeData.unit}`; break;
            case "compare": description = "Compare Dates"; break;
        }
    }

    return (
        <>
            <DateTimeDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                onSubmit={handleSubmit}
                defaultValues={nodeData}
            />
            <BaseExecutionNode
                {...props}
                id={props.id}
                // Update this path to a clock or calendar icon in your public/logos folder
                icon="/logos/clock.svg" 
                name="Date & Time"
                description={description}
                onSettings={handleOpenSettings}
                onDoubleClick={() => handleOpenSettings()}
            />
        </>
    )
})

DateTimeNode.displayName = "DateTimeNode";