"use client"

import { Node, NodeProps, useReactFlow } from "@xyflow/react"
import { BaseExecutionNode } from "@/features/executions/components/base-execution-node"
import { memo, useState } from "react";
import { CalculatorDialog, CalculatorFormValues } from "./dialog";
import { useNodeStatus } from "../../hooks/use-node-status";
import { Calculator as CalculatorIcon } from "lucide-react";

type CalculatorNodeData = CalculatorFormValues;
type CalculatorNodeType = Node<CalculatorNodeData>;

export const CalculatorNode = memo((props: NodeProps<CalculatorNodeType>) => {
    const [dialogOpen, setDialogOpen] = useState(false);
    const { setNodes } = useReactFlow();
    const nodeStatus = useNodeStatus(props.id);

    const handleOpenSettings = () => setDialogOpen(true);

    const handleSubmit = (values: CalculatorFormValues) => {
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
    if (nodeData?.operation && nodeData?.inputA) {
        const opMap: Record<string, string> = {
            add: "+", subtract: "-", multiply: "×", divide: "÷", 
            round: "Round", floor: "Floor", ceil: "Ceil"
        };
        const symbol = opMap[nodeData.operation];
        
        if (["add", "subtract", "multiply", "divide"].includes(nodeData.operation)) {
            description = `${nodeData.inputA} ${symbol} ${nodeData.inputB || "?"}`;
        } else {
            description = `${symbol}(${nodeData.inputA})`;
        }
    }

    return (
        <>
            <CalculatorDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                onSubmit={handleSubmit}
                defaultValues={nodeData}
            />
            <BaseExecutionNode
                {...props}
                id={props.id}
                icon={CalculatorIcon} 
                name="Calculator"
                description={description}
                onSettings={handleOpenSettings}
                onDoubleClick={handleOpenSettings}
            />
        </>
    )
})

CalculatorNode.displayName = "CalculatorNode";