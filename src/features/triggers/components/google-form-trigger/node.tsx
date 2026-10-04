import { Node, NodeProps, useReactFlow } from "@xyflow/react"
import { memo, useState } from "react"
import { BaseTriggerNode } from "../base-trigger-node"
import { GoogleFormTriggerDialog } from "./dialog"
import { useNodeStatus } from "@/features/executions/hooks/use-node-status"

type GoogleFormTriggerNodeData = {
    secret?: string;
}

type GoogleFormTriggerNodeType = Node<GoogleFormTriggerNodeData>

export const GoogleFormTrigger = memo((props: NodeProps<GoogleFormTriggerNodeType>) => {

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
            <GoogleFormTriggerDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                secret={props.data?.secret}
                onSecretChange={handleSecretChange}
            />
            <BaseTriggerNode
                {...props}
                icon="/logos/googleform.svg"
                name="Google Form"
                description="When form is submitted"
                status={nodeStatus.status}
                onSettings={handleOpenSettings}
                onDoubleClick={handleOpenSettings}
            />

        </>
    )
})

GoogleFormTrigger.displayName = "GoogleFormTrigger"
