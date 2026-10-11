import { type Node, type NodeProps, useReactFlow } from "@xyflow/react"
import { memo, useState } from "react"
import { BaseTriggerNode } from "../base-trigger-node"
import { MessageSquare } from "lucide-react"
import { ChatTriggerDialog, type ChatTriggerValues } from "./dialog"
import { useNodeStatus } from "@/features/executions/hooks/use-node-status"


export const ChatTriggerNode = memo((props: NodeProps<Node<Partial<ChatTriggerValues>>>) => {

    const [dialogOpen, setDialogOpen] = useState(false)
    const { setNodes } = useReactFlow()

    // "Make chat public" and the widget's settings are kept on the node
    const handleSubmit = (values: ChatTriggerValues) => {
        setNodes((nodes) =>
            nodes.map((node) =>
                node.id === props.id
                    ? { ...node, data: { ...node.data, ...values } }
                    : node
            )
        )
    }

    const nodeStatus = useNodeStatus(props.id);

    const handleOpenSettings = () => setDialogOpen(true)
    return (
        <>
            <ChatTriggerDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                onSubmit={handleSubmit}
                defaultValues={props.data}
                nodeId={props.id}
            />
            <BaseTriggerNode
                {...props}
                icon={MessageSquare}
                name="When chat message received"
                description={props.data?.chatPublic ? "Public chat" : undefined}
                status={nodeStatus.status}
                onSettings={handleOpenSettings}
                onDoubleClick={handleOpenSettings}
            />

        </>
    )
})

ChatTriggerNode.displayName = "ChatTriggerNode"
