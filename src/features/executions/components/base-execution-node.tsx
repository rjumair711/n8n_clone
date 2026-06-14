"use client";

import {
    type NodeProps,
    Position,
    useReactFlow,
} from "@xyflow/react";

import Image from "next/image";
import { memo, type ReactNode } from "react";

import {
    BaseNode,
    BaseNodeContent,
} from "@/components/react-flow/base-node";

import { BaseHandle } from "../../../components/react-flow/base-handle";
import { WorkflowNode } from "../../../components/workflow-node";
import { LucideIcon } from "lucide-react";
import { NodeStatusIndicator } from "@/components/react-flow/node-status-indicator";
import { cn } from "@/lib/utils";
import { useNodeStatus } from "../hooks/use-node-status";

interface BaseExecutionNodeProps extends NodeProps {
    icon: LucideIcon | string;
    name: string;
    description?: string;
    children?: ReactNode;
    onSettings?: () => void;
    onDoubleClick?: () => void;
}

export const BaseExecutionNode = memo(
    ({
        id,
        icon: Icon,
        name,
        description,
        children,
        onSettings,
        onDoubleClick,
    }: BaseExecutionNodeProps) => {

        const { setNodes, setEdges } = useReactFlow();

        const handleDelete = () => {
            setNodes((currentNodes) => {
                return currentNodes.filter((node) => node.id !== id);
            });

            setEdges((currentEdges) => {
                return currentEdges.filter(
                    (edge) => edge.source !== id && edge.target !== id
                );
            });
        };

        const nodeExecution = useNodeStatus(id);
        const status = nodeExecution.status;

        return (
            <WorkflowNode
                name={name}
                description={description}
                onDelete={handleDelete}
                onSettings={onSettings}
            >
                <NodeStatusIndicator
                    status={status}
                    variant="border"
                >
                    <BaseNode
                        status={status}
                        onDoubleClick={onDoubleClick}
                        className={cn(
                            "relative group transition-all duration-300",
                            status === "loading" && "animate-pulse shadow-lg shadow-blue-500/20",
                            status === "success" && "shadow-lg shadow-green-500/20",
                            status === "error" && "shadow-lg shadow-red-500/20"
                        )}
                    >
                        <BaseNodeContent>
                            {typeof Icon === "string" ? (
                                <Image src={Icon} alt={name} width={16} height={16} />
                            ) : (
                                <Icon className="size-4 text-muted-foreground" />
                            )}

                            {children}

                            {/* Removed the redundant stacked StatusIcon component here to prevent vertical stretching */}

                            <BaseHandle id="target-1" type="target" position={Position.Left} />
                            <BaseHandle id="source-1" type="source" position={Position.Right} />
                        </BaseNodeContent>
                    </BaseNode>
                </NodeStatusIndicator>
            </WorkflowNode>
        );
    }
);

BaseExecutionNode.displayName = "BaseExecutionNode";