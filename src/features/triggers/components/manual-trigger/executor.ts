import type { NodeExecutor } from "@/features/executions/types";


type ManualTriggerData = Record<string, unknown>


export const manualTriggerExecutor: NodeExecutor<ManualTriggerData> = async ({
    nodeId,
    context,
    step
}) => {
    const result = await step.run("manual-trigger", async () => context)


    /**
     * Publish "success" state for manual trigger
     */


    return result;
}