"use client";

import "@xyflow/react/dist/style.css";
import { ErrorView, LoadingView } from "@/components/entity-components";
import { useSuspenseWorkflow } from "@/features/workflows/hooks/use-workflows";
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
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
import { EditorBuildWithAi } from "@/features/ai-builder/components/editor-build-with-ai";
import { usePinNode } from "@/features/executions/components/node-test-actions";
import { Button } from "@/components/ui/button";
import { Redo2Icon, StickyNoteIcon, Undo2Icon } from "lucide-react";
import { createId } from "@paralleldrive/cuid2";
import { newStickyNote, STICKY_DEFAULT_SIZE } from "../lib/sticky-notes";
import {
    emptyHistory,
    historyShortcut,
    isUndoableChange,
    recordChange,
    redoChange,
    undoChange,
    type CanvasHistory,
} from "../lib/canvas-history";

// 1. Import your AI Agent Dialog component

// Outside the component: React Flow re-registers the edge types whenever it
// gets a new object
const edgeTypes = {
    execution: ExecutionEdge,
};

// The same empty list on every render while no run is shown
const NO_EXECUTION_NODES: unknown[] = [];

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
    const { data: executionNodes = NO_EXECUTION_NODES } = useExecutionNodes(activeExecutionId ?? undefined);

    // "Pin this output" in the logs: the output of the run that is shown
    const pinNode = usePinNode(workflowId);

    // =====================================
    // WORKFLOW
    // =====================================
    const { data: workflow } = useSuspenseWorkflow(workflowId);
    // Sticky notes sit behind the nodes they describe (zIndex is not saved)
    const [nodes, setNodes] = useState<Node[]>(() =>
        workflow.nodes.map((node) =>
            node.type === NodeType.STICKY_NOTE ? { ...node, zIndex: -1 } : node
        )
    );
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

    // A node's output as text for the logs. Made once per answer from the
    // server, not on every render: outputs can be large, and the editor
    // renders on every drag
    const outputTexts = useMemo(
        () =>
            new Map(
                deduplicatedNodes.map((node: any) => [
                    node,
                    node.output ? JSON.stringify(node.output, null, 2) : undefined,
                ])
            ),
        [deduplicatedNodes]
    );

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
                : node.status === "WAITING"
                    ? "waiting"
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
        output: outputTexts.get(node),
        dataSource:
            node.dataSource === "pinned" || node.dataSource === "saved"
                ? node.dataSource
                : undefined,
        // A node that ran and whose output was stored, and is still on the canvas
        onPin:
            node.status === "SUCCESS" &&
            node.output &&
            !node.dataSource &&
            activeExecutionId &&
            nodes.some((canvasNode) => canvasNode.id === node.nodeId)
                ? () =>
                    pinNode.mutate({
                        id: workflowId,
                        nodeId: node.nodeId,
                        executionId: activeExecutionId,
                    })
                : undefined,
    }));

    // =====================================
    // UNDO / REDO
    // =====================================
    // The canvas as it is, for the change handlers (they are created once)
    const nodesRef = useRef(nodes);
    const edgesRef = useRef(edges);
    nodesRef.current = nodes;
    edgesRef.current = edges;
    const historyRef = useRef<CanvasHistory<Node, Edge>>(emptyHistory());
    const dragRef = useRef(false);
    // Re-renders the Undo / Redo buttons when the history changes
    const [historySize, setHistorySize] = useState({ past: 0, future: 0 });

    const syncHistory = useCallback(() => {
        const { past, future } = historyRef.current;
        setHistorySize({ past: past.length, future: future.length });
    }, []);

    const remember = useCallback(() => {
        historyRef.current = recordChange(historyRef.current, {
            nodes: nodesRef.current,
            edges: edgesRef.current,
        });
        syncHistory();
    }, [syncHistory]);

    const restore = useCallback((direction: "undo" | "redo") => {
        const step = direction === "undo" ? undoChange : redoChange;
        const { history, snapshot } = step(historyRef.current, {
            nodes: nodesRef.current,
            edges: edgesRef.current,
        });
        if (!snapshot) return;
        historyRef.current = history;
        setNodes(snapshot.nodes);
        setEdges(snapshot.edges);
        syncHistory();
    }, [syncHistory]);

    // Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (or Ctrl+Y), not while typing in a
    // field or a dialog
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            const typing =
                !!target &&
                (target.isContentEditable ||
                    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
                    !!target.closest("[role=dialog]"));
            const action = historyShortcut({
                key: event.key,
                ctrlKey: event.ctrlKey,
                metaKey: event.metaKey,
                shiftKey: event.shiftKey,
                altKey: event.altKey,
                typing,
            });
            if (!action) return;
            event.preventDefault();
            restore(action);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [restore]);

    // =====================================
    // STICKY NOTES
    // =====================================
    // Only what placing a note needs, so the editor's own node types fit
    const flowRef = useRef<{ screenToFlowPosition: (point: { x: number; y: number }) => { x: number; y: number } } | null>(null);
    const addStickyNote = useCallback(() => {
        remember();
        // In the middle of what is on screen
        const pane = document.querySelector(".react-flow")?.getBoundingClientRect();
        const center = flowRef.current && pane
            ? flowRef.current.screenToFlowPosition({ x: pane.left + pane.width / 2, y: pane.top + pane.height / 2 })
            : { x: 0, y: 0 };
        setNodes((current) => [
            ...current.map((node) => ({ ...node, selected: false })),
            {
                id: createId(),
                type: NodeType.STICKY_NOTE,
                position: {
                    x: Math.round(center.x - STICKY_DEFAULT_SIZE.width / 2),
                    y: Math.round(center.y - STICKY_DEFAULT_SIZE.height / 2),
                },
                data: newStickyNote(),
                selected: true,
                // Behind the nodes it describes
                zIndex: -1,
            },
        ]);
    }, [remember]);

    // =====================================
    // NODE CHANGES
    // =====================================
    const onNodesChange = useCallback(
        (changes: NodeChange[]) => {
            if (isUndoableChange(changes, dragRef.current)) remember();
            // A drag is one step: from its first move until it is let go
            for (const change of changes) {
                if (change.type === "position") dragRef.current = change.dragging === true;
            }
            setNodes((nds) => applyNodeChanges(changes, nds));
        },
        [remember]
    );

    // =====================================
    // EDGE CHANGES
    // =====================================
    const onEdgesChange = useCallback(
        (changes: EdgeChange[]) => {
            if (isUndoableChange(changes, false)) remember();
            setEdges((eds) => applyEdgeChanges(changes, eds));
        },
        [remember]
    );

    // =====================================
    // CONNECT NODES
    // =====================================
    const onConnect = useCallback(
        (params: Connection) => {
            remember();
            setEdges((eds) => addEdge(params, eds));
        },
        [remember]
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
            NodeType.MESSENGER_TRIGGER,
            NodeType.INSTAGRAM_TRIGGER,
            NodeType.GMAIL_TRIGGER,
            NodeType.TYPEFORM_TRIGGER,
            NodeType.SHOPIFY_TRIGGER,
            NodeType.WOOCOMMERCE_TRIGGER,
            NodeType.RSS_FEED_TRIGGER,
            NodeType.FORM_TRIGGER,
            NodeType.MCP_SERVER_TRIGGER,
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

    const executionEdges = useMemo(
        () => edges.map((edge) => ({ ...edge, type: "execution" })),
        [edges]
    );

    const setNodeStatus = useExecutionStore((state) => state.setNodeStatus);

    // Sync DB polling results into the store so canvas nodes show status
    useEffect(() => {
        if (!activeExecutionId) return;

        executionNodes.forEach((node: any) => {
            setNodeStatus(node.nodeId, {
                status:
                    // A node paused at a Wait is still in progress on the canvas
                    node.status === "RUNNING" || node.status === "WAITING"
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
                    edges={executionEdges}
                    edgeTypes={edgeTypes}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onNodeClick={onNodeClick} 
                    nodeTypes={nodeComponents}
                    onInit={(instance) => {
                        flowRef.current = instance;
                        setEditor(instance as unknown as Parameters<typeof setEditor>[0]);
                    }}
                    fitView
                    snapGrid={[10, 10]}
                    snapToGrid
                    panOnDrag={false}
                    selectionOnDrag
                >
                    <Background />
                    <Controls className="rounded-xl border bg-background shadow-md" />
                    <MiniMap pannable zoomable className="rounded-xl border bg-background shadow-md" />

                    <Panel position="top-left">
                        <div className="flex items-center gap-1 rounded-xl border bg-background p-1 shadow-md">
                            <Button
                                size="icon"
                                variant="ghost"
                                className="size-8"
                                title="Undo (Ctrl+Z)"
                                aria-label="Undo"
                                disabled={historySize.past === 0}
                                onClick={() => restore("undo")}
                            >
                                <Undo2Icon className="size-4" />
                            </Button>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="size-8"
                                title="Redo (Ctrl+Shift+Z)"
                                aria-label="Redo"
                                disabled={historySize.future === 0}
                                onClick={() => restore("redo")}
                            >
                                <Redo2Icon className="size-4" />
                            </Button>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="size-8"
                                title="Add a sticky note"
                                aria-label="Add a sticky note"
                                onClick={addStickyNote}
                            >
                                <StickyNoteIcon className="size-4" />
                            </Button>
                        </div>
                    </Panel>

                    <Panel position="top-right">
                        <div className="flex items-center gap-2">
                            <EditorBuildWithAi />
                            <AddNodeButton />
                        </div>
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