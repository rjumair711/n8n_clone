import { memo, useState } from "react";
import { NodeProps, Node, useReactFlow } from "@xyflow/react";
import { BaseExecutionNode } from "../base-execution-node";
import { WebhookResponseDialog, WebhookResponseFormValues } from "./dialog"; // Dialog import
import { Send } from "lucide-react";  // Icon import for the Webhook Response node
import { useNodeStatus } from "../../hooks/use-node-status";
import { WEBHOOK_CHANNEL_NAME } from "@/inngest/channels/webhookResponse";

// Define the data type for Webhook Response Node
type WebhookResponseNodeData = {
  responseMessage?: string;  // Custom response message
  responseStatus?: "success" | "error";  // Response status
  webhookUrl?: string; 
};

type WebhookResponseNodeType = Node<WebhookResponseNodeData>;

export const WebhookResponseNode = memo((props: NodeProps<WebhookResponseNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes } = useReactFlow();

  const nodeStatus = useNodeStatus({
    nodeId: props.id,
    channel: WEBHOOK_CHANNEL_NAME,
    topic: "status",
    refreshToken: async () => {
      const response = await fetch(
        `/api/realtime-token/${WEBHOOK_CHANNEL_NAME}`
      );
      return response.json();
    },
  });


  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: WebhookResponseFormValues) => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === props.id
          ? {
            ...node,
            data: {
              ...node.data,
              ...values, // Spread the new values directly
            },
          }
          : node
      )
    );
  };

  // Access the responseMessage and make sure it's treated as a string
  const responseMsg = props.data?.responseMessage;
  const targetUrl = props.data?.webhookUrl;

  const description = targetUrl
    ? `Sending to: ${targetUrl.slice(0, 30)}...`
    : "⚠️ URL not configured";

  return (
    <>
      <WebhookResponseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={props.data} // Passing existing node data to dialog
      />

      {/* Pass properties explicitly instead of using `as any` */}
      <BaseExecutionNode
        {...(props as any)}
        id={props.id}
        icon={Send}  // Sending icon for webhook response node
        name="Webhook Response"
        status={nodeStatus} // Placeholder for actual status
        description={description}
        onSettings={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
    </>
  );
});

WebhookResponseNode.displayName = "WebhookResponseNode";