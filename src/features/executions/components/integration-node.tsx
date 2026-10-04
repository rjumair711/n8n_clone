"use client";

import { Node, NodeProps, useReactFlow } from "@xyflow/react";
import { BaseExecutionNode } from "@/features/executions/components/base-execution-node";
import { memo, useState } from "react";
import {
  IntegrationDialog,
  type IntegrationConfig,
  type IntegrationFormValues,
} from "./integration-dialog";

type IntegrationNodeType = Node<Partial<IntegrationFormValues>>;

/**
 * Builds the canvas node for an integration from its config: the settings
 * dialog, the logo and a one-line summary of the chosen operation.
 */
export const createIntegrationNode = (
  config: IntegrationConfig,
  describe?: (data: Partial<IntegrationFormValues>) => string | undefined
) => {
  const IntegrationNode = memo((props: NodeProps<IntegrationNodeType>) => {
    const [dialogOpen, setDialogOpen] = useState(false);
    const { setNodes } = useReactFlow();

    const handleOpenSettings = () => setDialogOpen(true);

    const handleSubmit = (values: IntegrationFormValues) => {
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

    const nodeData = props.data || {};

    const operationLabel = config.operations.find(
      (option) => option.value === nodeData.operation
    )?.label;

    const description = !nodeData.credentialId
      ? "Not Configured"
      : describe?.(nodeData) || operationLabel || "Configured";

    return (
      <>
        <IntegrationDialog
          config={config}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSubmit={handleSubmit}
          defaultValues={nodeData}
        />
        <BaseExecutionNode
          {...props}
          id={props.id}
          icon={config.logo}
          name={config.label}
          description={description}
          onSettings={handleOpenSettings}
          onDoubleClick={handleOpenSettings}
        />
      </>
    );
  });

  IntegrationNode.displayName = `${config.label.replace(/\s+/g, "")}Node`;

  return IntegrationNode;
};
