import { NodeType } from "@prisma/client";
import { buildSampleFormValues, parseFormFields } from "@/lib/form-fields";
import { parseMetaMessages } from "@/lib/meta-messaging";
import { normalizeToolName, readToolSchema } from "@/lib/mcp-server";
import {
    buildShopifyTriggerData,
    buildWoocommerceTriggerData,
} from "@/lib/store-webhooks";
import {
    ANY_EVENT,
    SHOPIFY_EVENTS,
    WOOCOMMERCE_EVENTS,
    WOOCOMMERCE_PAID_EVENT,
} from "@/features/executions/lib/store-options";

// Triggers the editor's Execute button can run once with sample data
export const TESTABLE_TRIGGERS = [
    NodeType.MANUAL_TRIGGER,
    NodeType.SCHEDULE_TRIGGER,
    NodeType.WEBHOOK_TRIGGER,
    NodeType.STRIPE_TRIGGER,
    NodeType.GOOGLE_FORM_TRIGGER,
    NodeType.TELEGRAM_TRIGGER,
    NodeType.WHATSAPP_TRIGGER,
    NodeType.MESSENGER_TRIGGER,
    NodeType.INSTAGRAM_TRIGGER,
    NodeType.GMAIL_TRIGGER,
    NodeType.TYPEFORM_TRIGGER,
    NodeType.SHOPIFY_TRIGGER,
    NodeType.WOOCOMMERCE_TRIGGER,
    NodeType.RSS_FEED_TRIGGER,
    NodeType.FORM_TRIGGER,
    NodeType.MCP_SERVER_TRIGGER,
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
    MESSENGER_TRIGGER: "Messenger",
    INSTAGRAM_TRIGGER: "Instagram",
    GMAIL_TRIGGER: "Gmail",
    TYPEFORM_TRIGGER: "Typeform",
    SHOPIFY_TRIGGER: "Shopify",
    WOOCOMMERCE_TRIGGER: "WooCommerce",
    RSS_FEED_TRIGGER: "RSS Feed",
    FORM_TRIGGER: "Form",
    MCP_SERVER_TRIGGER: "MCP tool call",
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

        case NodeType.MESSENGER_TRIGGER:
        case NodeType.INSTAGRAM_TRIGGER: {
            const channel =
                trigger === NodeType.MESSENGER_TRIGGER ? "messenger" : "instagram";
            const accountId = "100000000000001";

            // Built from a delivery of the shape Meta sends, by the same
            // code that reads a real one
            const [message] = parseMetaMessages(channel, {
                object: channel === "messenger" ? "page" : "instagram",
                entry: [
                    {
                        id: accountId,
                        time: now.getTime(),
                        messaging: [
                            {
                                sender: { id: "200000000000002" },
                                recipient: { id: accountId },
                                timestamp: now.getTime(),
                                message: { mid: "m_sample", text: "Hello from a test run" },
                            },
                        ],
                    },
                ],
            });

            return {
                [channel]: message.data,
                chatInput: message.chatInput,
                sessionId: message.sessionId,
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

        case NodeType.SHOPIFY_TRIGGER: {
            const selected = String(nodeData.event ?? "");
            // "Any event" is tried with a paid order
            const topic =
                selected !== ANY_EVENT &&
                SHOPIFY_EVENTS.some((event) => event.value === selected)
                    ? selected
                    : "orders/paid";
            const resource = topic.split("/")[0];
            const customer = {
                id: 7000000000001,
                email: "customer@example.com",
                first_name: "Sample",
                last_name: "Customer",
                phone: "+923001234567",
            };
            const stamp = { created_at: now.toISOString(), updated_at: now.toISOString() };

            const body =
                resource === "products"
                    ? {
                          id: 8000000000001,
                          title: "Sample product",
                          status: "active",
                          vendor: "Sample vendor",
                          ...stamp,
                          variants: [
                              {
                                  id: 44000000000001,
                                  price: "20.00",
                                  sku: "SAMPLE-1",
                                  inventory_item_id: 46000000000001,
                                  inventory_quantity: 12,
                              },
                          ],
                      }
                    : resource === "customers"
                      ? { ...customer, ...stamp }
                      : resource === "checkouts"
                        ? {
                              id: 30000000000001,
                              token: "sample-checkout-token",
                              email: customer.email,
                              phone: customer.phone,
                              total_price: "20.00",
                              currency: "USD",
                              completed_at: null,
                              abandoned_checkout_url:
                                  "https://sample-store.myshopify.com/checkouts/sample/recover",
                              ...stamp,
                              customer,
                              line_items: [{ title: "Sample product", quantity: 1, price: "20.00" }],
                          }
                        : {
                              id: 5000000000001,
                              name: "#1001",
                              order_number: 1001,
                              email: customer.email,
                              phone: customer.phone,
                              total_price: "20.00",
                              currency: "USD",
                              financial_status: topic === "orders/create" ? "pending" : "paid",
                              fulfillment_status: topic === "orders/fulfilled" ? "fulfilled" : null,
                              order_status_url:
                                  "https://sample-store.myshopify.com/orders/sample/authenticate",
                              ...stamp,
                              customer,
                              line_items: [{ title: "Sample product", quantity: 1, price: "20.00" }],
                          };

            return {
                shopify: buildShopifyTriggerData({
                    topic,
                    shopDomain: "sample-store.myshopify.com",
                    body,
                }),
            };
        }

        case NodeType.WOOCOMMERCE_TRIGGER: {
            const selected = String(nodeData.event ?? "");
            const known =
                selected !== ANY_EVENT &&
                WOOCOMMERCE_EVENTS.some((event) => event.value === selected);
            const event = known ? selected : WOOCOMMERCE_PAID_EVENT;
            // "Order paid" arrives as an order update
            const topic = event === WOOCOMMERCE_PAID_EVENT ? "order.updated" : event;
            const resource = topic.split(".")[0];
            const billing = {
                first_name: "Sample",
                last_name: "Customer",
                email: "customer@example.com",
                phone: "+923001234567",
            };

            const body =
                resource === "product"
                    ? {
                          id: 101,
                          name: "Sample product",
                          status: "publish",
                          sku: "SAMPLE-1",
                          price: "20.00",
                          regular_price: "20.00",
                          stock_quantity: 12,
                          date_modified: now.toISOString(),
                      }
                    : resource === "customer"
                      ? {
                            id: 25,
                            email: billing.email,
                            first_name: billing.first_name,
                            last_name: billing.last_name,
                            billing,
                            date_created: now.toISOString(),
                        }
                      : {
                            id: 727,
                            number: "727",
                            status:
                                String(nodeData.orderStatus ?? "").trim() ||
                                (topic === "order.created" ? "pending" : "processing"),
                            currency: "USD",
                            total: "20.00",
                            customer_id: 25,
                            date_created: now.toISOString(),
                            date_paid: topic === "order.created" ? null : now.toISOString(),
                            payment_method_title: "Sample payment",
                            billing,
                            line_items: [{ name: "Sample product", quantity: 1, total: "20.00" }],
                        };

            return {
                woocommerce: buildWoocommerceTriggerData({
                    event,
                    topic,
                    source: "https://shop.example.com/",
                    body,
                }),
            };
        }

        case NodeType.FORM_TRIGGER:
            // A value of the right kind for every field of the form
            return {
                form: buildSampleFormValues(parseFormFields(nodeData.formFields)),
                formMeta: { formId: "test", submittedAt: now.toISOString() },
            };

        case NodeType.MCP_SERVER_TRIGGER: {
            // A call of this node's tool, with a value of the right kind
            // for every parameter
            const samples: Record<string, unknown> = {
                string: "sample",
                number: 1.5,
                integer: 1,
                boolean: true,
                array: ["sample"],
                object: {},
            };
            const schema = readToolSchema(nodeData);

            return {
                mcp: {
                    tool: normalizeToolName(nodeData.toolName),
                    arguments: Object.fromEntries(
                        Object.entries(schema.properties).map(([name, definition]) => [
                            name,
                            samples[String(definition?.type)] ?? "sample",
                        ])
                    ),
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
