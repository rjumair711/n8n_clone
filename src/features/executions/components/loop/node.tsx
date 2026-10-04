"use client";

import { Node, NodeProps, useReactFlow } from "@xyflow/react";
import { BaseExecutionNode } from "@/features/executions/components/base-execution-node";
import { memo, useState } from "react";
import { LoopDialog, LoopFormValues } from "./dialog";
import { Repeat } from "lucide-react";

type LoopNodeData = {
  itemsPath?: string;
  variableName?: string;
  maxIterations?: number;
};

type LoopNodeType = Node<LoopNodeData>;

// Handle ids must match LOOP_BODY_OUTPUT / LOOP_DONE_OUTPUT in the engine
const OUTPUTS = [
  { id: "loop", label: "Each item" },
  { id: "done", label: "Done" },
];

export const LoopNode = memo((props: NodeProps<LoopNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes } = useReactFlow();

  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: LoopFormValues) => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id === props.id) {
          return {
            ...node,
            data: {
              ...node.data,
              ...values,
            },
          };
        }

        return node;
      })
    );
  };

  const nodeData = props.data;

  const description = nodeData?.itemsPath
    ? `For each item in ${nodeData.itemsPath}`
    : "Not Configured";

  return (
    <>
      <LoopDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={nodeData}
      />

      <BaseExecutionNode
        {...props}
        id={props.id}
        icon={Repeat}
        name="Loop"
        description={description}
        outputs={OUTPUTS}
        onSettings={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
    </>
  );
});

LoopNode.displayName = "LoopNode";
