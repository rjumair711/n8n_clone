"use client";

import "@xyflow/react/dist/style.css";
import { ErrorView, LoadingView } from "@/components/entity-components";
import { useSuspenseWorkflow } from "@/features/workflows/hooks/use-workflows";
import { useState, useCallback, useMemo, useEffect } from "react";
import {
    ReactFlow,
    applyNodeChanges,
    applyEdgeChanges,
    Node,
    addEdge,
    Edge,
    NodeChange,
    EdgeChange,
    Connection,
    Background,
    Controls,
    MiniMap,
    Panel,
} from "@xyflow/react";

import { nodeComponents } from "@/config/node-components";
import { AddNodeButton } from "./add-node-button";
import { useSetAtom } from "jotai";
import { editorAtom } from "../store/atoms";
import { NodeType } from "@prisma/client";
import { ExecuteWorkflowButton } from "./execute-workflow-button";
import { ExecutionSidebar, type ExecutionLog } from "@/features/executions/components/execution-sidebar";
import { ExecutionEdge } from "@/components/react-flow/execution-edge";
import { useExecutionStore } from "@/features/executions/store/execution-store";
import { useExecutionNodes } from "@/features/executions/hooks/use-execution-nodes";
import { useExecutionSubscription } from "@/features/executions/hooks/use-execution-subscription";

// 1. Import your AI Agent Dialog component

export const EditorLoading = () => <LoadingView message="Loading editor..." />;
export const EditorError = () => <ErrorView message="Error loading editor" />;

export const Editor = ({ workflowId }: { workflowId: string }) => {
    const setEditor = useSetAtom(editorAtom);

    // =====================================
    // ACTIVE EXECUTION
    // =====================================
    const activeExecutionId = useExecutionStore((state) => state.activeExecutionId);

    useExecutionSubscription(activeExecutionId);

    // =====================================
    // LIVE EXECUTION NODES
    // =====================================
    const { data: executionNodes = [] } = useExecutionNodes(activeExecutionId ?? undefined);

    // =====================================
    // WORKFLOW
    // =====================================
    const { data: workflow } = useSuspenseWorkflow(workflowId);
    const [nodes, setNodes] = useState<Node[]>(workflow.nodes);
    const [edges, setEdges] = useState<Edge[]>(workflow.edges);

    // 2. Added State to manage active dialog config targets
    const [editingNode, setEditingNode] = useState<Node | null>(null);

    // =====================================
    // DEDUPLICATE LOGS (FIX FOR TOO MANY LOGS)
    // =====================================
    const deduplicatedNodes = useMemo(() => {
        const map = new Map();
        executionNodes.forEach((node: any) => {
            const uniqueKey = node.nodeId || node.nodeName;
            map.set(uniqueKey, node);
        });
        return Array.from(map.values());
    }, [executionNodes]);

    // =====================================
    // SIDEBAR LOGS
    // =====================================
    const logs: ExecutionLog[] = deduplicatedNodes.map((node: any) => ({
        id: node.id,
        nodeName: node.nodeName,
        status:
            node.status === "RUNNING"
                ? "loading"
                : node.status === "SUCCESS"
                    ? "success"
                    : "error",
        duration:
            node.completedAt && node.startedAt
                ? `${Math.floor(
                    (new Date(node.completedAt).getTime() - new Date(node.startedAt).getTime()) / 1000
                )}s`
                : undefined,
        error: node.error,
        output: node.output ? JSON.stringify(node.output, null, 2) : undefined,
    }));

    // =====================================
    // NODE CHANGES
    // =====================================
    const onNodesChange = useCallback(
        (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
        []
    );

    // =====================================
    // EDGE CHANGES
    // =====================================
    const onEdgesChange = useCallback(
        (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
        []
    );

    // =====================================
    // CONNECT NODES
    // =====================================
    const onConnect = useCallback(
        (params: Connection) => setEdges((eds) => addEdge(params, eds)),
        []
    );

    // 3. Catch node selection click events on canvas layout
    const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
        if (node.type === "AI_AGENT") {
            setEditingNode(node);
        }
    }, []);

    // ALLOW EXECUTION PANEL FOR TESTING
    // =====================================
    const showExecuteButton = useMemo(() => {
        return nodes.some(
            (node) =>
                node.type === NodeType.MANUAL_TRIGGER ||
                node.type === NodeType.SCHEDULE_TRIGGER
        );
    }, [nodes]);

    // =====================================
    // EDGE TYPES
    // =====================================
    const edgeTypes = {
        execution: ExecutionEdge,
    };

    const setNodeStatus = useExecutionStore((state) => state.setNodeStatus);

    // Sync DB polling results into the store so canvas nodes show status
    useEffect(() => {
        executionNodes.forEach((node: any) => {
            setNodeStatus(node.nodeId, {
                status:
                    node.status === "RUNNING"
                        ? "loading"
                        : node.status === "SUCCESS"
                            ? "success"
                            : "error",
                error: node.error ?? undefined,
            });
        });
    }, [executionNodes, setNodeStatus]);

    // =====================================
    // RENDER
    // =====================================
    return (
        <div className="flex h-full w-full overflow-hidden">

            <div className="relative h-full flex-1 overflow-hidden">
                <ReactFlow
                    nodes={nodes}
                    edges={edges.map((edge) => ({
                        ...edge,
                        type: "execution",
                    }))}
                    edgeTypes={edgeTypes}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onNodeClick={onNodeClick} 
                    nodeTypes={nodeComponents}
                    onInit={setEditor}
                    fitView
                    snapGrid={[10, 10]}
                    snapToGrid
                    panOnDrag={false}
                    selectionOnDrag
                >
                    <Background />
                    <Controls className="rounded-xl border bg-background shadow-md" />
                    <MiniMap pannable zoomable className="rounded-xl border bg-background shadow-md" />

                    <Panel position="top-right">
                        <AddNodeButton />
                    </Panel>

                    {showExecuteButton && (
                        <Panel position="bottom-center">
                            <ExecuteWorkflowButton workflowId={workflowId} />
                        </Panel>
                    )}
                </ReactFlow>
            </div>
            <ExecutionSidebar logs={logs} />
        </div>
    );
};