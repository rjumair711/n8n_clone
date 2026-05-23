import { memo, useState } from "react";
import { NodeProps, Node, useReactFlow } from "@xyflow/react";
import { BaseExecutionNode } from "../base-execution-node";
import { GoogleSheetsDialog, GoogleSheetsFormValues } from "./dialog"; // Dialog import
import { Database } from "lucide-react";  // Icon import for Google Sheets node
import { useNodeStatus } from "../../hooks/use-node-status";
import { SHEETS_CHANNEL_NAME } from "@/inngest/channels/googleSheet";

// Define the data type for Google Sheets Node
type GoogleSheetsNodeData = {
  credentialId?: string;
  sheetId?: string;
  sheetName?: string;
  rowData?: string;
  variableName?: string;
};

type GoogleSheetsNodeType = Node<GoogleSheetsNodeData>;

export const GoogleSheetsNode = memo((props: NodeProps<GoogleSheetsNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes } = useReactFlow();

  const nodeStatus = useNodeStatus({
    nodeId: props.id,
    channel: SHEETS_CHANNEL_NAME,
    topic: "status",
    refreshToken: async () => {
          const response = await fetch(
            `/api/realtime-token/${SHEETS_CHANNEL_NAME}`
          );
          return response.json();
        },
  });

  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: GoogleSheetsFormValues) => {
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

  const description = `Google Sheet ID: ${props.data?.sheetId || "Not configured"}`;

  return (
    <>
      <GoogleSheetsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={props.data} // Passing existing node data to dialog
      />

      <BaseExecutionNode
        {...(props as any)}
        id={props.id}
        icon={Database}  // Use the Database icon from Lucide React
        name="Google Sheets"
        status={nodeStatus} // Placeholder for actual status
        description={description}
        onSettings={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
    </>
  );
});

GoogleSheetsNode.displayName = "GoogleSheetsNode";