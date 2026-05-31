import { create } from "zustand";

import type { NodeStatus } from "@/components/react-flow/node-status-indicator";

interface ExecutionNodeState {
    status: NodeStatus;

    output?: unknown;

    error?: string;
}

interface ExecutionStore {
    // All node execution states
    nodes: Record<
        string,
        ExecutionNodeState
    >;

    // Current execution state
    activeExecution: boolean;

    // Current active execution ID
    activeExecutionId: string | null;

    // Update single node state
    setNodeStatus: (
        nodeId: string,
        state: ExecutionNodeState
    ) => void;

    // Reset execution state
    resetExecution: () => void;

    // Set workflow execution active/inactive
    setExecutionActive: (
        active: boolean
    ) => void;

    // Store current execution ID
    setExecutionId: (
        id: string | null
    ) => void;
}

export const useExecutionStore =
    create<ExecutionStore>(
        (set) => ({
            // Node states
            nodes: {},

            // Workflow currently executing
            activeExecution: false,

            // Current execution ID
            activeExecutionId: null,

            // Update node execution state
            setNodeStatus: (
                nodeId,
                state
            ) =>
                set((current) => ({
                    nodes: {
                        ...current.nodes,

                        [nodeId]: {
                            ...current.nodes[
                                nodeId
                            ],

                            ...state,
                        },
                    },
                })),

            // Reset all execution states
            resetExecution:
                () =>
                    set({
                        nodes: {},
                        activeExecution:
                            false,
                        activeExecutionId:
                            null,
                    }),

            // Set execution active state
            setExecutionActive:
                (active) =>
                    set({
                        activeExecution:
                            active,
                    }),

            // Store execution ID
            setExecutionId:
                (id) =>
                    set({
                        activeExecutionId:
                            id,
                    }),
        })
    );