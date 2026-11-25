"use client";

import { useState } from "react";
import { useAtomValue } from "jotai";
import { BookOpenIcon, LifeBuoyIcon, MessageSquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getNodeLabel } from "@/config/node-labels";
import { editorAtom } from "@/features/editor/store/atoms";
import { guideTopicForNode, guideTopicHref, GUIDE_PATH } from "@/features/settings/lib/guide-links";
import { useSuspenseWorkflow } from "@/features/workflows/hooks/use-workflows";
import { SupportDialog, type SupportContext } from "./support-dialog";

/**
 * The workflow editor's Help button: the Platform guide (at the selected
 * node's topic, in a new tab so the canvas stays as it is), and "Contact
 * support" with this workflow and the selected node (if one is) attached.
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

    const openGuide = () => {
        const node = editor?.getNodes().find((item) => item.selected);
        const topic = guideTopicForNode(node?.type);
        window.open(topic ? guideTopicHref(topic) : GUIDE_PATH, "_blank", "noopener");
    };

    return (
        <>
            <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost" title="The Platform guide, or contact support">
                        <LifeBuoyIcon className="size-4" />
                        Help
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={openGuide}>
                        <BookOpenIcon className="size-4" />
                        Platform guide
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={openDialog}>
                        <MessageSquareIcon className="size-4" />
                        Contact support
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <SupportDialog open={open} onOpenChange={setOpen} context={context} />
        </>
    );
};
