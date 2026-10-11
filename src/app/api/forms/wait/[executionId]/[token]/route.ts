import { type NextRequest, NextResponse } from "next/server";
import { ExecutionStatus } from "@prisma/client";
import prisma from "@/lib/db";
import { inngest } from "@/inngest/client";
import { FORM_RATE_LIMIT, rateLimitResponse } from "@/lib/rate-limit";
import { verifyFormToken } from "@/lib/execution-wait";
import {
    FORM_SUBMITTED_EVENT,
    WAITING_FOR_FORM,
    WAITING_FOR_FORM_SUBMITTED,
} from "@/lib/form-fields";
import { loadWaitingForm } from "@/features/forms/server/waiting";
import {
    readFormData,
    readFormSubmission,
} from "@/features/forms/server/submission";

// The form pages of a running execution: a Form node, or a Wait node set
// to "On Form Submitted".
//
//   GET   what the hosted form should show now (it asks every second or so
//         while the workflow works towards the next page)
//   POST  the submitted page; the waiting run continues with its values
//
// The token belongs to the one execution; see lib/execution-wait.ts.

export const maxDuration = 60;

const notFound = () =>
    NextResponse.json(
        { success: false, error: "This form is not available" },
        { status: 404 }
    );

type Params = { params: Promise<{ executionId: string; token: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
    try {
        const { executionId, token } = await params;

        // Needs no database, so a guessed link costs nothing
        if (!verifyFormToken(executionId, token)) return notFound();

        const waiting = await loadWaitingForm(executionId);
        if (!waiting) return notFound();

        return NextResponse.json(waiting.state, {
            headers: { "Cache-Control": "private, no-store" },
        });
    } catch (error) {
        console.error("Form page error:", error instanceof Error ? error.message : error);

        return NextResponse.json({ state: "pending" }, { status: 500 });
    }
}

export async function POST(request: NextRequest, { params }: Params) {
    try {
        const { executionId, token } = await params;

        if (!verifyFormToken(executionId, token)) return notFound();

        const limited = await rateLimitResponse(
            `form-page:${executionId}`,
            FORM_RATE_LIMIT
        );
        if (limited) return limited;

        const waiting = await loadWaitingForm(executionId);
        if (!waiting) return notFound();

        if (waiting.state.state !== "page" || !waiting.nodeId) {
            return NextResponse.json(
                {
                    success: false,
                    error: "This form was already submitted, or it is no longer open",
                },
                { status: 409 }
            );
        }

        const { fields } = waiting.state.page;
        const body = await readFormData(request, fields);

        if (!body.ok) {
            return NextResponse.json(
                { success: false, error: body.error },
                { status: body.status }
            );
        }

        // One submission per page: whoever changes this first has it
        const where = { id: executionId, status: ExecutionStatus.WAITING };
        const claimed = await prisma.execution.updateMany({
            where: { ...where, waitingFor: WAITING_FOR_FORM },
            data: { waitingFor: WAITING_FOR_FORM_SUBMITTED },
        });

        if (claimed.count === 0) {
            return NextResponse.json(
                { success: false, error: "This form was already submitted" },
                { status: 409 }
            );
        }

        // The page is open again when the submission turns out not to be
        // valid, or could not be handed to the workflow
        const reopen = () =>
            prisma.execution.updateMany({
                where: { ...where, waitingFor: WAITING_FOR_FORM_SUBMITTED },
                data: { waitingFor: WAITING_FOR_FORM },
            });

        try {
            const submission = await readFormSubmission({
                form: body.form,
                fields,
                userId: waiting.userId,
                executionId,
            });

            if (!submission.ok) {
                await reopen();

                return NextResponse.json(
                    {
                        success: false,
                        error: submission.error,
                        errors: submission.errors ?? {},
                    },
                    { status: submission.status }
                );
            }

            // The node's step.waitForEvent is listening for this
            await inngest.send({
                name: FORM_SUBMITTED_EVENT,
                data: {
                    executionId,
                    nodeId: waiting.nodeId,
                    values: submission.values,
                },
            });
        } catch (error) {
            await reopen();
            throw error;
        }

        // The same address tells the page what comes next
        return NextResponse.json({ success: true, next: new URL(request.url).pathname });
    } catch (error) {
        // Never the URL: its last part is the secret
        console.error("Form page error:", error instanceof Error ? error.message : error);

        return NextResponse.json(
            { success: false, error: "The form could not be submitted. Try again." },
            { status: 500 }
        );
    }
}
