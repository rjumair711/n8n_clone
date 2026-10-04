import { Button } from "@/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";

import { useExecuteWorkflow } from "@/features/workflows/hooks/use-workflows";

import {
    FlaskConicalIcon,
    LoaderCircle,
} from "lucide-react";

import { NodeType } from "@prisma/client";

import { useExecutionStore } from "@/features/executions/store/execution-store";
import { useUpgradeModal } from "@/hooks/use-upgrade-modal";

// Triggers the Execute button knows how to start
export type ExecuteTrigger = Extract<
    NodeType,
    | "MANUAL_TRIGGER"
    | "SCHEDULE_TRIGGER"
    | "WEBHOOK_TRIGGER"
    | "STRIPE_TRIGGER"
    | "GOOGLE_FORM_TRIGGER"
    | "CHAT_TRIGGER"
>;

export const ExecuteWorkflowButton = ({
    workflowId,
    trigger,
    onOpenChat,
}: {
    workflowId: string;
    // The trigger on the canvas this button runs; null when there is none
    trigger: ExecuteTrigger | null;
    onOpenChat: () => void;
}) => {

    const executeWorkflow =
        useExecuteWorkflow();

    const { handleError, modal } = useUpgradeModal();

    const {
        resetExecution,
        setExecutionActive,
        setExecutionId,
    } =
        useExecutionStore();

    const handleExecute =
        () => {

            if (!trigger) return;

            // A chat workflow needs a message: open the chat instead
            if (trigger === NodeType.CHAT_TRIGGER) {
                onOpenChat();
                return;
            }

            // Reset previous execution state
            resetExecution();

            // Start execution mode
            setExecutionActive(true);

            executeWorkflow.mutate(
                {
                    id: workflowId,

                    // Non-manual triggers run once with a sample payload
                    trigger,
                },

                {
                    onSuccess: (
                        data
                    ) => {

                        // Save active execution ID
                        // IMPORTANT:
                        // backend must return executionId
                        if (
                            data.executionId
                        ) {
                            setExecutionId(
                                data.executionId
                            );
                        }
                    },

                    onError: (error) => {

                        // Stop execution mode
                        setExecutionActive(
                            false
                        );

                        // Plan and limit errors offer the upgrade
                        handleError(error);
                    },
                }
            );
        };

    const button = (
        <Button
            size="lg"
            onClick={handleExecute}
            disabled={
                !trigger ||
                executeWorkflow.isPending
            }
        >
            {executeWorkflow.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
            ) : (
                <FlaskConicalIcon className="size-4" />
            )}

            Execute workflow
        </Button>
    );

    return (
        <>
            {modal}

            {trigger ? (
                button
            ) : (
                <Tooltip>
                    <TooltipTrigger asChild>
                        {/* The span keeps the tooltip working while the button is disabled */}
                        <span>{button}</span>
                    </TooltipTrigger>
                    <TooltipContent>
                        Add a trigger to run this workflow
                    </TooltipContent>
                </Tooltip>
            )}
        </>
    );
};
