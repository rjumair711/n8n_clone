import { NodeType } from "@prisma/client";

// Triggers the editor's Execute button can run once with sample data
export const TESTABLE_TRIGGERS = [
    NodeType.MANUAL_TRIGGER,
    NodeType.SCHEDULE_TRIGGER,
    NodeType.WEBHOOK_TRIGGER,
    NodeType.STRIPE_TRIGGER,
    NodeType.GOOGLE_FORM_TRIGGER,
] as const;

export type TestableTrigger = (typeof TESTABLE_TRIGGERS)[number];

export const TRIGGER_LABELS: Record<TestableTrigger, string> = {
    MANUAL_TRIGGER: "Manual",
    SCHEDULE_TRIGGER: "Schedule",
    WEBHOOK_TRIGGER: "Webhook",
    STRIPE_TRIGGER: "Stripe",
    GOOGLE_FORM_TRIGGER: "Google Form",
};

/**
 * The data a test run starts with. Each payload has the same shape the real
 * trigger produces (see the webhook routes and the schedule heartbeat), so
 * {{variables}} that work in a test run also work for real events.
 */
export const buildTestPayload = (
    trigger: TestableTrigger,
    nodeData: Record<string, unknown>
): Record<string, unknown> => {
    const now = new Date();

    switch (trigger) {
        case NodeType.SCHEDULE_TRIGGER:
            return {
                metadata: {
                    triggeredBy: "manual-test",
                    timestamp: now.toISOString(),
                    interval: nodeData.cronExpression ?? nodeData.interval ?? null,
                },
            };

        case NodeType.WEBHOOK_TRIGGER:
            return {
                webhook: {
                    method: "GET",
                    query: {},
                    body: {},
                    headers: {},
                },
            };

        case NodeType.STRIPE_TRIGGER:
            return {
                stripe: {
                    eventId: "evt_test_sample",
                    eventType: "payment_intent.succeeded",
                    timestamp: Math.floor(now.getTime() / 1000),
                    livemode: false,
                    raw: {
                        id: "pi_test_sample",
                        object: "payment_intent",
                        amount: 2000,
                        currency: "usd",
                        customer: "cus_test_sample",
                        receipt_email: "customer@example.com",
                        status: "succeeded",
                    },
                },
            };

        case NodeType.GOOGLE_FORM_TRIGGER: {
            const body = {
                formId: "sample-form-id",
                formTitle: "Sample Form",
                responseId: "sample-response-id",
                timestamp: now.toISOString(),
                respondentEmail: "respondent@example.com",
                responses: {
                    Name: "Sample Name",
                    Message: "This is a sample answer",
                },
            };

            return { googleForm: { ...body, raw: body } };
        }

        default:
            return {};
    }
};
