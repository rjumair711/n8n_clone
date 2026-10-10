import { findTriggerNodes, startWorkflowExecution } from "@/inngest/utils";
import {
    WEBHOOK_TOLERANCE_SECONDS,
    isRecentTypeformEvent,
    verifyTypeformSignature,
} from "@/lib/webhook-security";
import { rateLimitResponse } from "@/lib/rate-limit";
import { type NextRequest, NextResponse } from "next/server";
import { NodeType } from "@prisma/client";

// The value of one answer, whatever the question type
const readAnswer = (answer: any): unknown => {
    switch (answer?.type) {
        case "choice":
            return answer.choice?.label ?? answer.choice?.other ?? null;
        case "choices":
            return [
                ...(answer.choices?.labels ?? []),
                ...(answer.choices?.other ? [answer.choices.other] : []),
            ];
        case "payment":
            return answer.payment ?? null;
        default:
            // text, email, url, phone_number, number, boolean, date, file_url...
            return answer?.[answer?.type] ?? null;
    }
};

// Typeform posts every submission of the form here
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ workflowId: string }> }
) {
    const { workflowId } = await params;

    const limited = await rateLimitResponse(`typeform:${workflowId}`);
    if (limited) return limited;

    const triggerNodes = await findTriggerNodes(
        workflowId,
        NodeType.TYPEFORM_TRIGGER
    );

    if (triggerNodes.length === 0) {
        return NextResponse.json(
            {
                success: false,
                error: "Workflow not found, not active, or it has no Typeform trigger",
            },
            { status: 404 }
        );
    }

    // The signature covers the exact bytes Typeform sent:
    // "sha256=" + base64(HMAC-SHA256(raw body, secret))
    const rawBody = await request.text();
    const signatureHeader = request.headers.get("typeform-signature");

    const verified = triggerNodes.some((node) => {
        const secret = (node.data as { secret?: string } | null)?.secret?.trim();

        return (
            !!secret &&
            verifyTypeformSignature({ rawBody, signatureHeader, secret })
        );
    });

    if (!verified) {
        return NextResponse.json(
            {
                success: false,
                error: "Invalid signature. Use the same Secret in the Typeform webhook and in the Typeform Trigger node, then save the workflow.",
            },
            { status: 401 }
        );
    }

    let body: any;
    try {
        body = JSON.parse(rawBody);
    } catch {
        return NextResponse.json(
            { success: false, error: "The request body is not JSON" },
            { status: 400 }
        );
    }

    // A correctly signed submission that was captured cannot be sent again
    // later: its time of submission is part of what is signed
    if (!isRecentTypeformEvent(body)) {
        return NextResponse.json(
            {
                success: false,
                error: `This submission is more than ${WEBHOOK_TOLERANCE_SECONDS / 60} minutes old (or has no submitted_at) and was not accepted.`,
            },
            { status: 401 }
        );
    }

    try {
        const response = body.form_response ?? {};

        const titles = new Map<string, string>(
            (response.definition?.fields ?? []).map((field: any) => [
                field.id,
                field.title,
            ])
        );

        // Each answer is reachable by its question title and by the field's ref
        const answers: Record<string, unknown> = {};
        for (const answer of response.answers ?? []) {
            const value = readAnswer(answer);
            const title = titles.get(answer.field?.id);

            if (title) answers[title] = value;
            if (answer.field?.ref) answers[answer.field.ref] = value;
        }

        await startWorkflowExecution({
            workflowId,
            trigger: NodeType.TYPEFORM_TRIGGER,

            initialData: {
                typeform: {
                    formId: response.form_id,
                    formTitle: response.definition?.title,
                    responseId: response.token,
                    submittedAt: response.submitted_at,
                    answers,
                    hidden: response.hidden ?? {},
                    raw: response,
                },
            },

            // Typeform re-sends a submission when it gets no 2xx answer
            dedupeKey: body.event_id ?? response.token,
        });
    } catch (error) {
        console.error("Typeform webhook error:", error);

        return NextResponse.json(
            { success: false, error: "Failed to process the Typeform submission" },
            { status: 500 }
        );
    }

    return NextResponse.json({ success: true });
}
