"use client";

import {
    type NodeProps,
    Position,
    useReactFlow,
} from "@xyflow/react";

import Image from "next/image";

import {
    memo,
    type ReactNode,
} from "react";

import {
    BaseNode,
    BaseNodeContent,
} from "@/components/react-flow/base-node";

import { BaseHandle } from "../../../components/react-flow/base-handle";

import { WorkflowNode } from "../../../components/workflow-node";

import {
    LucideIcon,
    LoaderCircle,
    CheckCircle2,
    XCircle,
} from "lucide-react";

import {
    NodeStatus,
    NodeStatusIndicator,
} from "@/components/react-flow/node-status-indicator";

import { cn } from "@/lib/utils";
import { useNodeStatus } from "../hooks/use-node-status";

interface BaseExecutionNodeProps
    extends NodeProps {
    icon: LucideIcon | string;
    name: string;
    description?: string;
    children?: ReactNode;
    status?: NodeStatus;
    onSettings?: () => void;
    onDoubleClick?: () => void;
}

export const BaseExecutionNode =
    memo(
        ({
            id,
            icon: Icon,
            name,
            description,
            children,
            onSettings,
            onDoubleClick,
        }: BaseExecutionNodeProps) => {

            const {
                setNodes,
                setEdges,
            } = useReactFlow();

            const handleDelete = () => {
                setNodes((currentNodes) => {
                    return currentNodes.filter(
                        (node) =>
                            node.id !== id
                    );
                });

                setEdges((currentEdges) => {
                    return currentEdges.filter(
                        (edge) =>
                            edge.source !== id &&
                            edge.target !== id
                    );
                });
            };
            const nodeExecution = useNodeStatus(id);

            const status = nodeExecution.status;

            
            const StatusIcon = {
                loading: LoaderCircle,
                success: CheckCircle2,
                error: XCircle,
                initial: null,
            }[status];

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
                        <div
                            className={cn(
                                "rounded-xl transition-all duration-300",

                                status ===
                                "loading" &&
                                "animate-pulse shadow-lg shadow-blue-500/20",

                                status ===
                                "success" &&
                                "shadow-lg shadow-green-500/20",

                                status ===
                                "error" &&
                                "shadow-lg shadow-red-500/20"
                            )}
                        >
                            <BaseNode
                                status={status}
                                onDoubleClick={
                                    onDoubleClick
                                }
                            >
                                <BaseNodeContent>
                                    {typeof Icon ===
                                        "string" ? (
                                        <Image
                                            src={Icon}
                                            alt={name}
                                            width={16}
                                            height={16}
                                        />
                                    ) : (
                                        <Icon className="size-4 text-muted-foreground" />
                                    )}

                                    {children}

                                    {StatusIcon && (
                                        <StatusIcon
                                            className={cn(
                                                "ml-auto size-4",

                                                status ===
                                                "loading" &&
                                                "animate-spin text-blue-600",

                                                status ===
                                                "success" &&
                                                "text-green-600",

                                                status ===
                                                "error" &&
                                                "text-red-600"
                                            )}
                                        />
                                    )}

                                    <BaseHandle
                                        id="target-1"
                                        type="target"
                                        position={
                                            Position.Left
                                        }
                                    />

                                    <BaseHandle
                                        id="source-1"
                                        type="source"
                                        position={
                                            Position.Right
                                        }
                                    />
                                </BaseNodeContent>
                            </BaseNode>
                        </div>
                    </NodeStatusIndicator>
                </WorkflowNode>
            );
        }
    );

BaseExecutionNode.displayName =
    "BaseExecutionNode";