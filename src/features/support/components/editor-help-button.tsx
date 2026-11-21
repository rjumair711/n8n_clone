"use client";

import { useState } from "react";
import { useAtomValue } from "jotai";
import { LifeBuoyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getNodeLabel } from "@/config/node-labels";
import { editorAtom } from "@/features/editor/store/atoms";
import { useSuspenseWorkflow } from "@/features/workflows/hooks/use-workflows";
import { SupportDialog, type SupportContext } from "./support-dialog";

/**
 * The workflow editor's Help button: "Contact support" with this workflow
 * and the node selected on the canvas (if one is) attached.
 */
export const EditorHelpButton = ({ workflowId }: { workflowId: string }) => {
    const editor = useAtomValue(editorAtom);
    const { data: workflow } = useSuspenseWorkflow(workflowId);
    const [open, setOpen] = useState(false);
    const [context, setContext] = useState<SupportContext>({});

    const openDialog = () => {
        // Read when the button is pressed: the selection changes all the time
        const node = editor?.getNodes().find((item) => item.selected);
        const customName = (node?.data as { name?: unknown } | undefined)?.name;

        setContext({
            workflowId,
            workflowName: workflow.name,
            ...(node
                ? {
                      nodeId: node.id,
                      nodeName: typeof customName === "string" && customName.trim() ? customName : getNodeLabel(node.type),
                      nodeType: node.type,
                  }
                : {}),
        });
        setOpen(true);
    };

    return (
        <>
            <Button size="sm" variant="ghost" onClick={openDialog} title="Contact support about this workflow">
                <LifeBuoyIcon className="size-4" />
                Help
            </Button>
            <SupportDialog open={open} onOpenChange={setOpen} context={context} />
        </>
    );
};
