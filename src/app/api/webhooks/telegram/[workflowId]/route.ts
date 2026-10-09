import { findTriggerNodes, startWorkflowExecution } from "@/inngest/utils";
import { getAcceptedTelegramWebhookSecrets } from "@/lib/telegram";
import { secretsMatch } from "@/lib/webhook-security";
import { rateLimitResponse } from "@/lib/rate-limit";
import { type NextRequest, NextResponse } from "next/server";
import { NodeType } from "@prisma/client";

// Telegram posts every update for the bot here. The webhook is registered
// when the workflow is activated (see syncTelegramWebhooks).
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ workflowId: string }> }
) {
    const { workflowId } = await params;

    const limited = await rateLimitResponse(`telegram:${workflowId}`);
    if (limited) return limited;

    const provided =
        request.headers.get("x-telegram-bot-api-secret-token") || "";

    const accepted = getAcceptedTelegramWebhookSecrets(workflowId).some(
        (secret) => secretsMatch(provided, secret)
    );

    if (!accepted) {
        return NextResponse.json(
            { success: false, error: "Invalid secret token" },
            { status: 401 }
        );
    }

    try {
        const triggerNodes = await findTriggerNodes(
            workflowId,
            NodeType.TELEGRAM_TRIGGER
        );

        // Answer 200 anyway: Telegram keeps re-sending updates it gets errors for
        if (triggerNodes.length === 0) {
            return NextResponse.json({ success: true, ignored: true });
        }

        const update = await request.json();

        const message =
            update.message ?? update.edited_message ?? update.callback_query?.message;
        const text: string | undefined =
            update.message?.text ??
            update.edited_message?.text ??
            update.callback_query?.data;
        const chatId = message?.chat?.id;

        await startWorkflowExecution({
            workflowId,
            trigger: NodeType.TELEGRAM_TRIGGER,

            initialData: {
                // The update exactly as Telegram sent it, like n8n's trigger
                telegram: update,

                // What the AI Agent and its memory look for, so a bot works
                // by connecting Telegram Trigger -> AI Agent -> Telegram
                ...(text ? { chatInput: text } : {}),
                ...(chatId !== undefined
                    ? { sessionId: `telegram-${chatId}` }
                    : {}),
            },

            // Telegram re-sends an update it did not get a 200 for
            dedupeKey: update.update_id,
        });
    } catch (error) {
        console.error("Telegram webhook error:", error);
    }

    return NextResponse.json({ success: true });
}
