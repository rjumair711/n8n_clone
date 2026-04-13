"use server"

import { getSubscriptionToken, type Realtime } from "@inngest/realtime"
import { httpRequestChannel } from "@/inngest/channels/http-request"
import { inngest } from "@/inngest/client"
import { manualTriggerChannel } from "@/inngest/channels/manual-trigger"
import { googleFormTriggerChannel } from "@/inngest/channels/google-form-trigger"


export type GoogleFormTriggerToken = Realtime.Token<
    typeof googleFormTriggerChannel,
    ["status"]
>


export async function fetchGoogleFormTriggerRealtimeToken(): Promise<GoogleFormTriggerToken> {
    const token = await getSubscriptionToken(inngest, {
        channel: googleFormTriggerChannel(),
        topics: ["status"],
    })
    return token;
}