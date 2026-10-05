import { NodeType } from "@prisma/client";

// Triggers the editor's Execute button can run once with sample data
export const TESTABLE_TRIGGERS = [
    NodeType.MANUAL_TRIGGER,
    NodeType.SCHEDULE_TRIGGER,
    NodeType.WEBHOOK_TRIGGER,
    NodeType.STRIPE_TRIGGER,
    NodeType.GOOGLE_FORM_TRIGGER,
    NodeType.TELEGRAM_TRIGGER,
    NodeType.WHATSAPP_TRIGGER,
    NodeType.GMAIL_TRIGGER,
    NodeType.TYPEFORM_TRIGGER,
    NodeType.RSS_FEED_TRIGGER,
    NodeType.ERROR_TRIGGER,
    NodeType.EXECUTE_WORKFLOW_TRIGGER,
] as const;

export type TestableTrigger = (typeof TESTABLE_TRIGGERS)[number];

export const TRIGGER_LABELS: Record<TestableTrigger, string> = {
    MANUAL_TRIGGER: "Manual",
    SCHEDULE_TRIGGER: "Schedule",
    WEBHOOK_TRIGGER: "Webhook",
    STRIPE_TRIGGER: "Stripe",
    GOOGLE_FORM_TRIGGER: "Google Form",
    TELEGRAM_TRIGGER: "Telegram",
    WHATSAPP_TRIGGER: "WhatsApp",
    GMAIL_TRIGGER: "Gmail",
    TYPEFORM_TRIGGER: "Typeform",
    RSS_FEED_TRIGGER: "RSS Feed",
    ERROR_TRIGGER: "Error Trigger",
    EXECUTE_WORKFLOW_TRIGGER: "Sub-workflow",
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

        case NodeType.TELEGRAM_TRIGGER: {
            const chat = { id: 123456789, type: "private", first_name: "Sample" };

            return {
                telegram: {
                    update_id: 100000001,
                    message: {
                        message_id: 1,
                        from: { id: chat.id, is_bot: false, first_name: "Sample" },
                        chat,
                        date: Math.floor(now.getTime() / 1000),
                        text: "Hello from a test run",
                    },
                },
                chatInput: "Hello from a test run",
                sessionId: `telegram-${chat.id}`,
            };
        }

        case NodeType.WHATSAPP_TRIGGER: {
            const message = {
                from: "923001234567",
                id: "wamid.sample",
                timestamp: String(Math.floor(now.getTime() / 1000)),
                type: "text",
                text: { body: "Hello from a test run" },
            };

            return {
                whatsapp: {
                    from: message.from,
                    name: "Sample Contact",
                    text: message.text.body,
                    type: message.type,
                    messageId: message.id,
                    timestamp: message.timestamp,
                    phoneNumberId: "123456789012345",
                    message,
                    raw: { messages: [message] },
                },
                chatInput: message.text.body,
                sessionId: `whatsapp-${message.from}`,
            };
        }

        case NodeType.GMAIL_TRIGGER:
            return {
                gmail: {
                    id: "sample-message-id",
                    threadId: "sample-thread-id",
                    from: "Sample Sender <sender@example.com>",
                    to: "you@example.com",
                    subject: "Sample subject",
                    date: now.toUTCString(),
                    snippet: "Hello from a test run",
                    labelIds: ["INBOX", "UNREAD"],
                    text: "Hello from a test run",
                },
            };

        case NodeType.TYPEFORM_TRIGGER: {
            const answers = {
                "What is your name?": "Sample Name",
                "Your email": "respondent@example.com",
                "How did you hear about us?": "A friend",
            };

            return {
                typeform: {
                    formId: "sample-form-id",
                    formTitle: "Sample Form",
                    responseId: "sample-response-id",
                    submittedAt: now.toISOString(),
                    answers,
                    hidden: {},
                    raw: { form_id: "sample-form-id", token: "sample-response-id" },
                },
            };
        }

        case NodeType.RSS_FEED_TRIGGER:
            return {
                rss: {
                    id: "https://example.com/posts/sample",
                    title: "Sample feed item",
                    link: "https://example.com/posts/sample",
                    pubDate: now.toISOString(),
                    author: "Sample Author",
                    snippet: "This is a sample item from a test run.",
                    content: "<p>This is a sample item from a test run.</p>",
                    categories: ["sample"],
                    feedTitle: "Sample Feed",
                    feedUrl:
                        typeof nodeData.url === "string" && nodeData.url
                            ? nodeData.url
                            : "https://example.com/feed.xml",
                },
            };

        case NodeType.ERROR_TRIGGER:
            return {
                execution: {
                    id: "sample-execution-id",
                    error: {
                        message: "Sample error: the request failed with status 500",
                        stack: "",
                    },
                    lastNodeExecuted: "HTTP_REQUEST",
                    lastNodeId: "sample-node-id",
                },
                workflow: { id: "sample-workflow-id", name: "Sample workflow" },
            };

        case NodeType.EXECUTE_WORKFLOW_TRIGGER:
            return {};

        default:
            return {};
    }
};
