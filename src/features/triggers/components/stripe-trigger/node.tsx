import { Node, NodeProps, useReactFlow } from "@xyflow/react"
import { memo, useState } from "react"
import { BaseTriggerNode } from "../base-trigger-node"
import { StripeTriggerDialog } from "./dialog"
import { useNodeStatus } from "@/features/executions/hooks/use-node-status"

type StripeTriggerNodeData = {
    signingSecret?: string;
}

type StripeTriggerNodeType = Node<StripeTriggerNodeData>

export const StripeTriggerNode = memo((props: NodeProps<StripeTriggerNodeType>) => {

    const [dialogOpen, setDialogOpen] = useState(false)
    const { setNodes } = useReactFlow()

    const nodeStatus = useNodeStatus(props.id);

    const handleSigningSecretChange = (signingSecret: string) => {
        setNodes((nodes) =>
            nodes.map((node) =>
                node.id === props.id
                    ? { ...node, data: { ...node.data, signingSecret } }
                    : node
            )
        )
    }

    const handleOpenSettings = () => setDialogOpen(true)
    return (
        <>
            <StripeTriggerDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                signingSecret={props.data?.signingSecret}
                onSigningSecretChange={handleSigningSecretChange}
            />
            <BaseTriggerNode
                {...props}
                icon="/logos/stripe.svg"
                name="Stripe"
                description={
                    props.data?.signingSecret
                        ? "When stripe event is captured"
                        : "Signing secret missing"
                }
                status={nodeStatus.status}
                onSettings={handleOpenSettings}
                onDoubleClick={handleOpenSettings}
            />

        </>
    )
})

StripeTriggerNode.displayName = "StripeTriggerNode"
