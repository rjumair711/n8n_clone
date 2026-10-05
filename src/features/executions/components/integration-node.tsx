"use client";

import { Node, NodeProps, useReactFlow } from "@xyflow/react";
import { BaseExecutionNode } from "@/features/executions/components/base-execution-node";
import { memo, useState } from "react";
import { BaseTriggerNode } from "@/features/triggers/components/base-trigger-node";
import { useNodeStatus } from "../hooks/use-node-status";
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
    const nodeStatus = useNodeStatus(props.id);

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

    const operationLabel = config.operations?.find(
      (option) => option.value === nodeData.operation
    )?.label;

    const credentialType = config.credentialTypeFor
      ? config.credentialTypeFor(nodeData)
      : config.credentialType;

    const description =
      credentialType && !nodeData.credentialId
        ? "Not Configured"
        : describe?.(nodeData) ||
          operationLabel ||
          config.summary ||
          "Configured";

    return (
      <>
        <IntegrationDialog
          config={config}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSubmit={handleSubmit}
          defaultValues={nodeData}
        />
        {config.trigger ? (
          <BaseTriggerNode
            {...props}
            id={props.id}
            icon={config.logo}
            name={config.label}
            description={description}
            status={nodeStatus.status}
            onSettings={handleOpenSettings}
            onDoubleClick={handleOpenSettings}
          />
        ) : (
          <BaseExecutionNode
            {...props}
            id={props.id}
            icon={config.logo}
            name={config.label}
            description={description}
            subInputs={config.subInputs}
            outputs={config.getOutputs?.(nodeData)}
            onSettings={handleOpenSettings}
            onDoubleClick={handleOpenSettings}
          />
        )}
      </>
    );
  });

  IntegrationNode.displayName = `${config.label.replace(/\s+/g, "")}Node`;

  return IntegrationNode;
};
