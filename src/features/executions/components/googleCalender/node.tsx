import { memo, useState } from "react";
import { NodeProps, Node, useReactFlow } from "@xyflow/react";
import { BaseExecutionNode } from "../base-execution-node";
import { GoogleCalendarDialog, GoogleCalendarFormValues } from "./dialog";
import { useNodeStatus } from "../../hooks/use-node-status";

// UPDATED: Added operation and eventId for full CRUD support
export type GoogleCalendarNodeData = {
  credentialId?: string;
  operation?: "create" | "update" | "delete"; // The new dropdown!
  calendarId?: string;
  eventId?: string; // Needed to find which event to update/delete
  summary?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  variableName?: string;
};

type GoogleCalendarNodeType = Node<GoogleCalendarNodeData>;

export const GoogleCalendarNode = memo((props: NodeProps<GoogleCalendarNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes } = useReactFlow();

  const nodeStatus = useNodeStatus(props.id);
  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: GoogleCalendarFormValues) => {
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

  // UPDATED: Make the node UI clearly show what action it is performing
  const operationLabel = props.data?.operation 
    ? props.data.operation.charAt(0).toUpperCase() + props.data.operation.slice(1) 
    : "Create";
  const description = `${operationLabel} Event: ${props.data?.calendarId || "Not configured"}`;

  return (
    <>
      <GoogleCalendarDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={props.data}
      />

      <BaseExecutionNode
        {...(props as any)}
        id={props.id}
        icon="/logos/calender.png"
        name="Google Calendar"
        status={nodeStatus.status}
        description={description}
        onSettings={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
    </>
  );
});

GoogleCalendarNode.displayName = "GoogleCalendarNode";