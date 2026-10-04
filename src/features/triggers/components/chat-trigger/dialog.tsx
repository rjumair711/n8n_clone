"use client"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const ChatTriggerDialog = ({
    open,
    onOpenChange
}: Props) => {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Chat Trigger</DialogTitle>
                    <DialogDescription>
                        Runs the workflow every time a message is sent from the
                        chat panel. Connect it to an AI Agent to build a chatbot.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="rounded-lg bg-muted p-4 space-y-2">
                        <h4 className="font-medium text-sm">How to use</h4>
                        <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                            <li>Connect this trigger to an AI Agent node</li>
                            <li>Connect a Chat Model to the agent (and optionally Memory and Tools)</li>
                            <li>Save the workflow</li>
                            <li>Click "Open chat" at the bottom of the canvas</li>
                        </ol>
                    </div>
                    <div className="rounded-lg bg-muted p-4 space-y-2">
                        <h4 className="font-medium text-sm">Available Variables</h4>
                        <ul className="text-sm text-muted-foreground space-y-1">
                            <li>
                                <code className="bg-background px-1 py-0.5 rounded">
                                    {"{{chatInput}}"}
                                </code>
                                - The message the user sent
                            </li>
                            <li>
                                <code className="bg-background px-1 py-0.5 rounded">
                                    {"{{sessionId}}"}
                                </code>
                                - Identifies the conversation, used by Memory
                            </li>
                        </ul>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
