import { memo, useState } from "react";
import { NodeProps, Node, useReactFlow } from "@xyflow/react";
import { BufferMemoryDialog, BufferMemoryFormValues } from "./dialog";
import { Database, History } from "lucide-react";
import { useNodeStatus } from "@/features/executions/hooks/use-node-status";
import { BaseExecutionNode } from "@/features/executions/components/base-execution-node";

type BufferMemoryData = {
  sessionId?: string;
  windowSize?: number;
};

type BufferMemoryNodeType = Node<BufferMemoryData>;

export const BufferMemoryNode = memo((props: NodeProps<BufferMemoryNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes } = useReactFlow();

  const nodeStatus = useNodeStatus(props.id);
  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: BufferMemoryFormValues) => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === props.id
          ? {
              ...node,
              data: {
                ...node.data,
                ...values,
              },
            }
          : node
      )
    );
  };

  const sessionIdPreview = props.data?.sessionId || "{{webhook.sessionId}}";
  const windowSizePreview = props.data?.windowSize || 10;
  
  const description = `Session: ${sessionIdPreview} (Last ${windowSizePreview} msgs)`;

  return (
    <>
      <BufferMemoryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={props.data}
      />

      <BaseExecutionNode
        {...(props as any)}
        id={props.id}
        icon={Database}
        name="Buffer Memory"
        status={nodeStatus.status}
        description={description}
        onSettings={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
    </>
  );
});

BufferMemoryNode.displayName = "BufferMemoryNode";