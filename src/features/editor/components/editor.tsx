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
import { ExecuteWorkflowButton, type ExecuteTrigger } from "./execute-workflow-button";
import { ChatPanel } from "./chat-panel";
import { VariablePickerProvider } from "@/components/variable-picker";
import { getNodeLabel } from "@/config/node-labels";
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
    // The store is shared by every editor page. Only read an execution that
    // belongs to this workflow, so a new workflow never opens with another
    // workflow's logs (not even for the first render).
    const activeExecutionId = useExecutionStore((state) =>
        state.workflowId === workflowId ? state.activeExecutionId : null
    );
    const setWorkflow = useExecutionStore((state) => state.setWorkflow);
    const resetExecution = useExecutionStore((state) => state.resetExecution);

    // Opening a different workflow clears the logs and the node status badges
    useEffect(() => {
        setWorkflow(workflowId);
    }, [workflowId, setWorkflow]);

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
    const formatDuration = (ms: number) =>
        ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;

    const logs: ExecutionLog[] = deduplicatedNodes.map((node: any) => ({
        id: node.id,
        // "HTTP Request" instead of HTTP_REQUEST
        nodeName: getNodeLabel(node.nodeType || node.nodeName),
        // The variable name the user gave the node on the canvas
        detail: nodes.find((canvasNode) => canvasNode.id === node.nodeId)?.data
            ?.variableName as string | undefined,
        status:
            node.status === "RUNNING"
                ? "loading"
                : node.status === "SUCCESS"
                    ? "success"
                    : "error",
        duration:
            node.completedAt && node.startedAt
                ? formatDuration(
                    node.durationMs ??
                    new Date(node.completedAt).getTime() - new Date(node.startedAt).getTime()
                )
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

    // WHICH TRIGGER THE EXECUTE BUTTON RUNS
    // =====================================
    // With several triggers on the canvas the first match in this order wins
    const executeTrigger = useMemo(() => {
        const order: ExecuteTrigger[] = [
            NodeType.MANUAL_TRIGGER,
            NodeType.SCHEDULE_TRIGGER,
            NodeType.WEBHOOK_TRIGGER,
            NodeType.STRIPE_TRIGGER,
            NodeType.GOOGLE_FORM_TRIGGER,
            NodeType.TELEGRAM_TRIGGER,
            NodeType.WHATSAPP_TRIGGER,
            NodeType.GMAIL_TRIGGER,
            NodeType.TYPEFORM_TRIGGER,
            NodeType.RSS_FEED_TRIGGER,
            NodeType.EXECUTE_WORKFLOW_TRIGGER,
            NodeType.CHAT_TRIGGER,
            // Last: a workflow's Error Trigger only handles its failures
            NodeType.ERROR_TRIGGER,
        ];

        return (
            order.find((type) => nodes.some((node) => node.type === type)) ?? null
        );
    }, [nodes]);

    const [chatOpen, setChatOpen] = useState(false);

    // The chat panel drives workflows that start with a Chat Trigger
    const showChatButton = useMemo(() => {
        return nodes.some((node) => node.type === NodeType.CHAT_TRIGGER);
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
        if (!activeExecutionId) return;

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
    }, [executionNodes, setNodeStatus, activeExecutionId]);

    // =====================================
    // RENDER
    // =====================================
    return (
        <VariablePickerProvider workflowId={workflowId}>
        <div className="flex h-full w-full overflow-hidden">

            <div className="relative h-full min-w-0 flex-1 overflow-hidden">
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

                    <Panel position="bottom-center">
                        <div className="flex items-center gap-2">
                            <ExecuteWorkflowButton
                                workflowId={workflowId}
                                trigger={executeTrigger}
                                onOpenChat={() => setChatOpen(true)}
                            />
                            {showChatButton && (
                                <ChatPanel
                                    workflowId={workflowId}
                                    open={chatOpen}
                                    onOpenChange={setChatOpen}
                                    // With only a Chat Trigger, Execute opens the chat itself
                                    showTrigger={executeTrigger !== NodeType.CHAT_TRIGGER}
                                />
                            )}
                        </div>
                    </Panel>
                </ReactFlow>
            </div>
            {/* Clearing is UI-only: executions stay in the database */}
            <ExecutionSidebar logs={logs} onClear={resetExecution} />
        </div>
        </VariablePickerProvider>
    );
};