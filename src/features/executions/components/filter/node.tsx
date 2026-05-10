"use client";

import { Node, NodeProps, useReactFlow } from "@xyflow/react";
import { BaseExecutionNode } from "@/features/executions/components/base-execution-node";
import { memo, useState } from "react";
import { FilterDialog, FilterFormValues } from "./dialog";
import { FilterIcon } from "lucide-react";
import { useNodeStatus } from "../../hooks/use-node-status";
import { FILTER_CHANNEL_NAME } from "@/inngest/channels/filter";
import { fetchFilterRealtimeToken } from "./action";

type FilterNodeData = {
  inputKey?: string;
  operator?: string;
  value?: string;
};

type FilterNodeType = Node<FilterNodeData>;

export const FilterNode = memo((props: NodeProps<FilterNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes } = useReactFlow();

  const handleOpenSettings = () => setDialogOpen(true);

  const nodeStatus = useNodeStatus({
    nodeId: props.id,
    channel: FILTER_CHANNEL_NAME,
    topic: "status",
    refreshToken: fetchFilterRealtimeToken,
  });

  const handleSubmit = (values: FilterFormValues) => {
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
    nodeData?.inputKey && nodeData?.operator
      ? `${nodeData.inputKey} ${nodeData.operator} ${nodeData.value || ""}`
      : "Not Configured";

  return (
    <>
      <FilterDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={nodeData}
      />

      <BaseExecutionNode
        {...props}
        id={props.id}
        icon={FilterIcon}
        name="Filter"
        status={nodeStatus}
        description={description}
        onSettings={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
    </>
  );
});

FilterNode.displayName = "FilterNode";