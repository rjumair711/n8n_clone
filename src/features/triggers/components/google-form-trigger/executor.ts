import type { NodeExecutor } from "@/features/executions/types";
import { googleFormTriggerChannel } from "@/inngest/channels/google-form-trigger";
import { manualTriggerChannel } from "@/inngest/channels/manual-trigger";


type GoogleFormTriggerExecutor = Record<string, unknown>

export const googleFormTriggerExecutor: NodeExecutor<GoogleFormTriggerExecutor> = async ({
    nodeId,
    context,
    step,
    publish
}) => {

    await publish(
        manualTriggerChannel().status({
            nodeId,
            status: "loading"
        })
    )

    const result = await step.run("google-form-trigger", async () => context)
   
    await publish(
        googleFormTriggerChannel().status({
            nodeId,
            status: "success"
        })
    )


    return result;
}