import { Node, NodeProps, useReactFlow } from "@xyflow/react"
import { memo, useState } from "react"
import { BaseTriggerNode } from "../base-trigger-node"
import { WebhookTriggerDialog } from "./dialog"
import { useNodeStatus } from "@/features/executions/hooks/use-node-status"
import { Webhook } from "lucide-react"

type WebhookTriggerNodeData = {
    secret?: string;
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

    const handleOpenSettings = () => setDialogOpen(true)
    return (
        <>
            <WebhookTriggerDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                secret={props.data?.secret}
                onSecretChange={handleSecretChange}
            />
            <BaseTriggerNode
                {...props}
                icon={Webhook}
                name="Webhook"
                description="When an HTTP request is received"
                status={nodeStatus.status}
                onSettings={handleOpenSettings}
                onDoubleClick={handleOpenSettings}
            />

        </>
    )
})

WebhookTriggerNode.displayName = "WebhookTriggerNode"
