import { NodeType } from "@prisma/client";
import { createMetaWebhookHandlers } from "@/lib/meta-webhook";

// Incoming direct messages of an Instagram professional account. The verify
// token check and the X-Hub-Signature-256 check are in meta-webhook.ts.
const handlers = createMetaWebhookHandlers({
    channel: "instagram",
    nodeType: NodeType.INSTAGRAM_TRIGGER,
    label: "Instagram",
});

export const GET = handlers.GET;
export const POST = handlers.POST;
