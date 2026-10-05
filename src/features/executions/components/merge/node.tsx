"use client";

import { Node, NodeProps, useReactFlow } from "@xyflow/react";
import { BaseExecutionNode } from "@/features/executions/components/base-execution-node";
import { memo, useState } from "react";
import { MergeDialog, MergeFormValues } from "./dialog";
import { Merge } from "lucide-react";

type MergeNodeData = Partial<MergeFormValues>;

type MergeNodeType = Node<MergeNodeData>;

export const MergeNode = memo((props: NodeProps<MergeNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes } = useReactFlow();

  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: MergeFormValues) => {
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

  const description =
    nodeData?.mode === "all"
      ? "Wait for all branches"
      : "Continue on any branch";

  return (
    <>
      <MergeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={nodeData}
      />

      <BaseExecutionNode
        {...props}
        id={props.id}
        icon={Merge}
        name="Merge"
        description={description}
        onSettings={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
    </>
  );
});

MergeNode.displayName = "MergeNode";
