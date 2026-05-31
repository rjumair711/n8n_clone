"use client";

import { useReactFlow, type NodeProps, type Node } from "@xyflow/react";
import { memo, useState } from "react";
import { DelayDialog, DelayFormValues } from "./dialog";
import { Clock } from "lucide-react";
import { BaseExecutionNode } from "../base-execution-node";
import { DELAY_CHANNEL_NAME } from "@/inngest/channels/delay";
import { useNodeStatus } from "../../hooks/use-node-status";
import { DISCORD_CHANNEL_NAME } from "@/inngest/channels/discord";

// Define the shape of your custom data
type DelayNodeData = {
  delayAmount?: number;
  delayUnit?: "seconds" | "minutes" | "hours";
};


type DelayNodeType = Node<DelayNodeData>

// Use Node<DelayNodeData> as the generic for NodeProps
export const DelayNode = memo((props: NodeProps<DelayNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes } = useReactFlow();

  const handleOpenSettings = () => setDialogOpen(true);


  const nodeStatus = useNodeStatus(props.id);

  const handleSubmit = (values: DelayFormValues) => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === props.id
          ? {
            ...node,
            data: {
              ...node.data,
              ...values, // values matches delayAmount and delayUnit
            },
          }
          : node
      )
    );
  };

  // Extracting data safely
  const { delayAmount, delayUnit } = props.data;

  const description = delayAmount
    ? `Delay for ${delayAmount} ${delayUnit}`
    : "Not Configured";

  return (
    <>
      <DelayDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={props.data}
      />

      <BaseExecutionNode
        {...props}
        icon={Clock}
        name="Delay"
        status={nodeStatus.status}
        description={description}
        onSettings={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
    </>
  );
});

DelayNode.displayName = "DelayNode";