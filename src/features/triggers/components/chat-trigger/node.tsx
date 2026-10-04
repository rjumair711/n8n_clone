import { NodeProps } from "@xyflow/react"
import { memo, useState } from "react"
import { BaseTriggerNode } from "../base-trigger-node"
import { MessageSquare } from "lucide-react"
import { ChatTriggerDialog } from "./dialog"
import { useNodeStatus } from "@/features/executions/hooks/use-node-status"


export const ChatTriggerNode = memo((props: NodeProps) => {

    const [dialogOpen, setDialogOpen] = useState(false)

    const nodeStatus = useNodeStatus(props.id);

    const handleOpenSettings = () => setDialogOpen(true)
    return (
        <>
            <ChatTriggerDialog open={dialogOpen} onOpenChange={setDialogOpen} />
            <BaseTriggerNode
                {...props}
                icon={MessageSquare}
                name="When chat message received"
                status={nodeStatus.status}
                onSettings={handleOpenSettings}
                onDoubleClick={handleOpenSettings}
            />

        </>
    )
})

ChatTriggerNode.displayName = "ChatTriggerNode"
