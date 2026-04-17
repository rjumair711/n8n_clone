import type { NodeExecutor } from "@/features/executions/types";
import { stripeTriggerChannel } from "@/inngest/channels/stripe-trigger";


type StripeTriggerExecutor = Record<string, unknown>

export const stripeTriggerExecutor: NodeExecutor<StripeTriggerExecutor> = async ({
    nodeId,
    context,
    step,
    publish
}) => {

    await publish(
        stripeTriggerChannel().status({
            nodeId,
            status: "loading"
        })
    )

    const result = await step.run("stripe-trigger", async () => context)
   
    await publish(
        stripeTriggerChannel().status({
            nodeId,
            status: "success"
        })
    )


    return result;
}