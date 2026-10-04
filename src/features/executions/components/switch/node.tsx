"use client";

import { Node, NodeProps, useReactFlow } from "@xyflow/react";
import { BaseExecutionNode } from "@/features/executions/components/base-execution-node";
import { memo, useState } from "react";
import { SwitchDialog, SwitchFormValues } from "./dialog";
import { GitFork } from "lucide-react";

export type SwitchRule = {
  id: string;
  label: string;
  inputKey: string;
  operator: string;
  value?: string;
};

type SwitchNodeData = {
  rules?: SwitchRule[];
  fallbackBranch?: boolean;
};

type SwitchNodeType = Node<SwitchNodeData>;

export const SwitchNode = memo((props: NodeProps<SwitchNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes } = useReactFlow();

  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: SwitchFormValues) => {
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
  const rules = nodeData?.rules || [];
  const hasFallback = nodeData?.fallbackBranch !== false;

  const description =
    rules.length > 0
      ? `${rules.length} Branch${rules.length > 1 ? "es" : ""}`
      : "Not Configured";

  // One output handle per rule; the handle id is what the engine matches
  // against the executor's matchedBranch.
  const outputs = [
    ...rules.map((rule) => ({ id: rule.id, label: rule.label })),
    ...(hasFallback ? [{ id: "default", label: "Default" }] : []),
  ];

  return (
    <>
      <SwitchDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={nodeData}
      />

      <BaseExecutionNode
        {...props}
        id={props.id}
        icon={GitFork}
        name="Switch"
        description={description}
        outputs={outputs}
        onSettings={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
    </>
  );
});

SwitchNode.displayName = "SwitchNode";
