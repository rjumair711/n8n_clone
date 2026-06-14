import { memo, useState } from "react";
import { NodeProps, Node, useReactFlow } from "@xyflow/react";
import { BaseExecutionNode } from "../base-execution-node";
import { CodeNodeDialog, CodeNodeFormValues } from "./dialog";
import { Code2 } from "lucide-react";
import { useNodeStatus } from "../../hooks/use-node-status";

type CodeNodeData = {
  code?: string;
  variableName?: string;
};

type CodeNodeType = Node<CodeNodeData>;

export const CodeNode = memo((props: NodeProps<CodeNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes } = useReactFlow();

  const nodeStatus = useNodeStatus(props.id);
  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: CodeNodeFormValues) => {
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

  const codeSnippet = props.data?.code 
    ? `${props.data.code.slice(0, 35)}...` 
    : "return context;";
  const description = `Output: {{${props.data?.variableName || "codeResult"}}} (${codeSnippet})`;

  return (
    <>
      <CodeNodeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={props.data}
      />

      <BaseExecutionNode
        {...(props as any)}
        id={props.id}
        icon={Code2}
        name="JavaScript Code"
        status={nodeStatus.status}
        description={description}
        onSettings={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
    </>
  );
});

CodeNode.displayName = "CodeNode";