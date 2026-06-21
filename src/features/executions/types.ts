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
}

export type NodeExecutor<
  TData = Record<string, unknown>
> = (
  params: NodeExecutorParams<TData>
) => Promise<WorkflowContext>;