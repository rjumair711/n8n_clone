import { Node, NodeProps, useReactFlow } from "@xyflow/react"
import { memo, useState } from "react"
import { BaseTriggerNode } from "../base-trigger-node"
import { WebhookTriggerDialog } from "./dialog"
import { useNodeStatus } from "@/features/executions/hooks/use-node-status"
import { Webhook } from "lucide-react"

type WebhookTriggerNodeData = {
    secret?: string;
    responseMode?: string;
}

const RESPONSE_MODE_LABELS: Record<string, string> = {
    lastNode: "Responds when the last node finishes",
    responseNode: "Responds with a Respond to Webhook node",
}

type WebhookTriggerNodeType = Node<WebhookTriggerNodeData>

export const WebhookTriggerNode = memo((props: NodeProps<WebhookTriggerNodeType>) => {

    const [dialogOpen, setDialogOpen] = useState(false)
    const { setNodes } = useReactFlow()

    const nodeStatus = useNodeStatus(props.id);

    const handleSecretChange = (secret: string) => {
        setNodes((nodes) =>
            nodes.map((node) =>
                node.id === props.id
                    ? { ...node, data: { ...node.data, secret } }
                    : node
            )
        )
    }

    const handleResponseModeChange = (responseMode: string) => {
        setNodes((nodes) =>
            nodes.map((node) =>
                node.id === props.id
                    ? { ...node, data: { ...node.data, responseMode } }
                    : node
            )
        )
    }

    const handleOpenSettings = () => setDialogOpen(true)
    return (
        <>
            <WebhookTriggerDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                secret={props.data?.secret}
                onSecretChange={handleSecretChange}
                responseMode={props.data?.responseMode}
                onResponseModeChange={handleResponseModeChange}
            />
            <BaseTriggerNode
                {...props}
                icon={Webhook}
                name="Webhook"
                description={
                    RESPONSE_MODE_LABELS[props.data?.responseMode || ""] ||
                    "When an HTTP request is received"
                }
                status={nodeStatus.status}
                onSettings={handleOpenSettings}
                onDoubleClick={handleOpenSettings}
            />

        </>
    )
})

WebhookTriggerNode.displayName = "WebhookTriggerNode"
