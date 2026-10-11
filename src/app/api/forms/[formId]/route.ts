import { type NextRequest, NextResponse } from "next/server";
import { NodeType } from "@prisma/client";
import { startWorkflowExecution } from "@/inngest/utils";
import { FORM_RATE_LIMIT, rateLimitResponse } from "@/lib/rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { createFormToken } from "@/lib/execution-wait";
import {
    loadTriggerForm,
    workflowHasFormPages,
} from "@/features/forms/server/trigger";
import {
    readFormData,
    readFormSubmission,
} from "@/features/forms/server/submission";

// A hosted form (/forms/<id>) posts here. A valid submission starts the
// workflow at its Form Trigger with the values under {{form}}.

// Uploads take longer than a JSON webhook
export const maxDuration = 60;

// The field Turnstile's widget adds to the form
const CAPTCHA_FIELD = "cf-turnstile-response";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ formId: string }> }
) {
    try {
        const { formId } = await params;

        // Before anything else, so a flood costs one query each
        const limited = await rateLimitResponse(`form:${formId}`, FORM_RATE_LIMIT);
        if (limited) return limited;

        const hosted = await loadTriggerForm(formId);

        if (!hosted) {
            return NextResponse.json(
                { success: false, error: "This form is not available" },
                { status: 404 }
            );
        }

        const body = await readFormData(request, hosted.page.fields);

        if (!body.ok) {
            return NextResponse.json(
                { success: false, error: body.error },
                { status: body.status }
            );
        }

        // Before any file is stored
        if (hosted.captcha) {
            const answer = body.form.get(CAPTCHA_FIELD);

            const human = await verifyTurnstileToken(
                typeof answer === "string" ? answer : null,
                hosted.captcha.secretKey,
                request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
            );

            if (!human) {
                return NextResponse.json(
                    {
                        success: false,
                        error: "Please complete the check that you are not a robot, then submit again",
                        captcha: true,
                    },
                    { status: 400 }
                );
            }
        }

        const submission = await readFormSubmission({
            form: body.form,
            fields: hosted.page.fields,
            userId: hosted.userId,
        });

        if (!submission.ok) {
            return NextResponse.json(
                {
                    success: false,
                    error: submission.error,
                    errors: submission.errors ?? {},
                },
                { status: submission.status }
            );
        }

        const execution = await startWorkflowExecution({
            workflowId: hosted.workflowId,
            trigger: NodeType.FORM_TRIGGER,
            initialData: {
                form: submission.values,
                formMeta: {
                    formId,
                    submittedAt: new Date().toISOString(),
                },
            },
        });

        // A multi-step form: the page waits for the next one
        const next = (await workflowHasFormPages(hosted.workflowId))
            ? `/api/forms/wait/${execution.id}/${createFormToken(execution.id)}`
            : null;

        return NextResponse.json({ success: true, next }, { status: 200 });
    } catch (error) {
        console.error(
            "Form submission error:",
            error instanceof Error ? error.message : error
        );

        return NextResponse.json(
            { success: false, error: "The form could not be submitted. Try again." },
            { status: 500 }
        );
    }
}
