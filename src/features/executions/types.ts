import { GetStepTools, Inngest } from "inngest";
import { Node, Connection, Credential } from "@prisma/client";

export type WorkflowContext = Record<string, unknown>;

export type StepTools = GetStepTools<Inngest.Any>;

// Create a composite type to account for the joined credential relation
export type NodeWithCredential = Node & {
  credential?: Credential | null;
};

export interface NodeExecutorParams<
  TData = Record<string, unknown>
> {
  data: TData;
  nodeId: string;
  userId: string;
  context: WorkflowContext;
  step: StepTools;
  credential?: any;
  publish?: any;
  
  // NEW: Graph topology for n8n-style dynamic connections
  allNodes: NodeWithCredential[]; 
  connections: Connection[];

  // How many of this node's connected inputs were reached in this run
  inputs?: { active: number; total: number };

  // For nodes that work on a whole list: the items a list node upstream
  // sent here, or null when there are none
  items?: unknown[] | null;

  // The execution this node runs in (absent in unit tests)
  executionId?: string;

  // True when the node runs as an AI Agent tool: its steps run inline, so it
  // cannot use step tools that only work at the top level (step.invoke)
  inline?: boolean;

  // How many Execute Workflow nodes deep this run is
  callDepth?: number;
}

export type NodeExecutor<
  TData = Record<string, unknown>
> = (
  params: NodeExecutorParams<TData>
) => Promise<WorkflowContext>;