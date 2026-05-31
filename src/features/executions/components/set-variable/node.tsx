"use client";

import { Node, NodeProps, useReactFlow } from "@xyflow/react";
import { BaseExecutionNode } from "@/features/executions/components/base-execution-node";
import { memo, useState } from "react";
import { SetVariableDialog, SetVariableFormValues } from "./dialog";  // Importing the dialog
import { VariableIcon } from "lucide-react";  // Using Lucide Variables icon
import { useNodeStatus } from "../../hooks/use-node-status";
import { SET_VARIABLE_CHANNEL_NAME } from "@/inngest/channels/set-variable";

// Define the data type for Set Variable Node
type SetVariableNodeData = {
  variableName?: string;
  variableValue?: string;
};

type SetVariableNodeType = Node<SetVariableNodeData>;

export const SetVariableNode = memo((props: NodeProps<SetVariableNodeType>) => {

  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes } = useReactFlow();

  // Handle opening the settings dialog
  const handleOpenSettings = () => setDialogOpen(true);

const nodeStatus = useNodeStatus(props.id);

  // Handle the submit action for the dialog form
  const handleSubmit = (values: SetVariableFormValues) => {
    const { variableName, variableValue } = values;

    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === props.id
          ? {
              ...node,
              data: {
                ...node.data,
                variableName,
                variableValue,
              },
            }
          : node
      )
    );
  };

  const nodeData = props.data;
  const description = nodeData?.variableName
    ? `${nodeData.variableName}: ${nodeData.variableValue}`
    : "Not Configured";

  return (
    <>
      {/* Set Variable Settings Dialog */}
      <SetVariableDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={nodeData}
      />

      {/* BaseExecutionNode for Set Variable */}
      <BaseExecutionNode
        {...props}
        id={props.id}
        icon={VariableIcon}  // Passing the Lucide Variables icon
        name="Set Variable"
        status={nodeStatus.status}  // You can later replace this with actual status
        description={description}
        onSettings={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
    </>
  );
});

SetVariableNode.displayName = "SetVariableNode";