import { NodeType } from "@prisma/client";
import { createMetaWebhookHandlers } from "@/lib/meta-webhook";

// Incoming messages of a Facebook Page (Messenger Platform). The verify
// token check and the X-Hub-Signature-256 check are in meta-webhook.ts.
const handlers = createMetaWebhookHandlers({
    channel: "messenger",
    nodeType: NodeType.MESSENGER_TRIGGER,
    label: "Messenger",
});

export const GET = handlers.GET;
export const POST = handlers.POST;
