// email/node.tsx
"use client"

import { memo, useState } from "react";
import { NodeProps, Node, useReactFlow } from "@xyflow/react";
import { BaseExecutionNode } from "../base-execution-node";
import { EmailDialog, EmailFormValues } from "./dialog";
import { Mail } from "lucide-react";
import { useNodeStatus } from "../../hooks/use-node-status";
import { EMAIL_CHANNEL_NAME } from "@/inngest/channels/email";


export const EmailSendNode = memo((props: NodeProps<Node>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes } = useReactFlow();

  const nodeStatus = useNodeStatus({
    nodeId: props.id,
    channel: EMAIL_CHANNEL_NAME,
    topic: "status",
    refreshToken: async () => {
      const response = await fetch(
        `/api/realtime-token/${EMAIL_CHANNEL_NAME}`
      );
      return response.json();
    },
  });

  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: EmailFormValues) => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === props.id
          ? { ...node, data: { ...node.data, ...values } }
          : node
      )
    );
  };

  const description = props.data?.recipient
    ? `To: ${props.data.recipient}`
    : "Not Configured";

  return (
    <>
      <EmailDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={props.data as Partial<EmailFormValues>}
      />
      <BaseExecutionNode
        {...props}
        id={props.id}
        icon={Mail}
        name="Email Send"
        status={nodeStatus}
        description={description}
        onSettings={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
    </>
  );
});

EmailSendNode.displayName = "EmailSendNode";