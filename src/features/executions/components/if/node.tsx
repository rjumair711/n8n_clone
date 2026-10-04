"use client";

import { Node, NodeProps, useReactFlow } from "@xyflow/react";
import { BaseExecutionNode } from "@/features/executions/components/base-execution-node";
import { memo, useState } from "react";
import { IfDialog, IfFormValues } from "./dialog";
import { GitBranch } from "lucide-react";

type IfNodeData = {
  conditions?: {
    inputKey: string;
    operator: string;
    value?: string;
  }[];
  combinator?: "and" | "or";
};

type IfNodeType = Node<IfNodeData>;

const OUTPUTS = [
  { id: "true", label: "True" },
  { id: "false", label: "False" },
];

export const IfNode = memo((props: NodeProps<IfNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes } = useReactFlow();

  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: IfFormValues) => {
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
  const conditions = nodeData?.conditions || [];
  const first = conditions[0];

  const description = !first
    ? "Not Configured"
    : conditions.length === 1
      ? `${first.inputKey} ${first.operator} ${first.value || ""}`
      : `${conditions.length} conditions (${(nodeData.combinator || "and").toUpperCase()})`;

  return (
    <>
      <IfDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={nodeData}
      />

      <BaseExecutionNode
        {...props}
        id={props.id}
        icon={GitBranch}
        name="IF"
        description={description}
        outputs={OUTPUTS}
        onSettings={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
    </>
  );
});

IfNode.displayName = "IfNode";
