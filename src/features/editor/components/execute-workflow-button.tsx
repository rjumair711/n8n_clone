import { Button } from "@/components/ui/button";

import { useExecuteWorkflow } from "@/features/workflows/hooks/use-workflows";

import {
    FlaskConicalIcon,
    LoaderCircle,
} from "lucide-react";

import { useExecutionStore } from "@/features/executions/store/execution-store";

export const ExecuteWorkflowButton = ({
    workflowId,
}: {
    workflowId: string;
}) => {

    const executeWorkflow =
        useExecuteWorkflow();

    const {
        resetExecution,
        setExecutionActive,
        setExecutionId,
    } =
        useExecutionStore();

    const handleExecute =
        () => {

            // Reset previous execution state
            resetExecution();

            // Start execution mode
            setExecutionActive(true);

            executeWorkflow.mutate(
                {
                    id: workflowId,
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

                    onError: () => {

                        // Stop execution mode
                        setExecutionActive(
                            false
                        );
                    },

                    onSettled: () => {

                        // Workflow finished
                        setExecutionActive(
                            false
                        );
                    },
                }
            );
        };

    return (
        <Button
            size="lg"
            onClick={handleExecute}
            disabled={
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
};