// How an execution was started. Stored on Execution.triggerSource.
export const TRIGGER_SOURCES = {
    MANUAL: "manual",
    // Started with the editor's Execute button for a non-manual trigger,
    // using a sample payload instead of a real event
    MANUAL_TEST: "manual-test",
    CHAT: "chat",
    SCHEDULE: "schedule",
    WEBHOOK: "webhook",
    STRIPE: "stripe",
    GOOGLE_FORM: "google-form",
    TELEGRAM: "telegram",
    WHATSAPP: "whatsapp",
    MESSENGER: "messenger",
    INSTAGRAM: "instagram",
    GMAIL: "gmail",
    TYPEFORM: "typeform",
    SHOPIFY: "shopify",
    WOOCOMMERCE: "woocommerce",
    RSS: "rss",
    FORM: "form",
    MCP: "mcp",
    // Started by a call to the public API (/api/v1)
    API: "api",
    // Started by an Error Trigger after another execution failed
    ERROR: "error",
    // Started by an Execute Workflow node
    WORKFLOW: "workflow",
    // One row of an evaluation dataset
    EVALUATION: "evaluation",
} as const;

const LABELS: Record<string, string> = {
    [TRIGGER_SOURCES.MANUAL]: "Manual",
    [TRIGGER_SOURCES.MANUAL_TEST]: "Test run from editor",
    [TRIGGER_SOURCES.CHAT]: "Chat",
    [TRIGGER_SOURCES.SCHEDULE]: "Schedule",
    [TRIGGER_SOURCES.WEBHOOK]: "Webhook",
    [TRIGGER_SOURCES.STRIPE]: "Stripe",
    [TRIGGER_SOURCES.GOOGLE_FORM]: "Google Form",
    [TRIGGER_SOURCES.TELEGRAM]: "Telegram",
    [TRIGGER_SOURCES.WHATSAPP]: "WhatsApp",
    [TRIGGER_SOURCES.MESSENGER]: "Messenger",
    [TRIGGER_SOURCES.INSTAGRAM]: "Instagram",
    [TRIGGER_SOURCES.GMAIL]: "Gmail",
    [TRIGGER_SOURCES.TYPEFORM]: "Typeform",
    [TRIGGER_SOURCES.SHOPIFY]: "Shopify",
    [TRIGGER_SOURCES.WOOCOMMERCE]: "WooCommerce",
    [TRIGGER_SOURCES.RSS]: "RSS Feed",
    [TRIGGER_SOURCES.FORM]: "Form",
    [TRIGGER_SOURCES.MCP]: "MCP tool call",
    [TRIGGER_SOURCES.API]: "API",
    [TRIGGER_SOURCES.ERROR]: "Error Trigger",
    [TRIGGER_SOURCES.WORKFLOW]: "Another workflow",
    [TRIGGER_SOURCES.EVALUATION]: "Evaluation",
};

// Executions created before the column existed have no source
export const formatTriggerSource = (source?: string | null) =>
    source ? LABELS[source] ?? source : null;

// The source recorded when a real event of the given trigger type arrives
export const TRIGGER_TYPE_SOURCES: Record<string, string> = {
    MANUAL_TRIGGER: TRIGGER_SOURCES.MANUAL,
    CHAT_TRIGGER: TRIGGER_SOURCES.CHAT,
    SCHEDULE_TRIGGER: TRIGGER_SOURCES.SCHEDULE,
    WEBHOOK_TRIGGER: TRIGGER_SOURCES.WEBHOOK,
    STRIPE_TRIGGER: TRIGGER_SOURCES.STRIPE,
    GOOGLE_FORM_TRIGGER: TRIGGER_SOURCES.GOOGLE_FORM,
    TELEGRAM_TRIGGER: TRIGGER_SOURCES.TELEGRAM,
    WHATSAPP_TRIGGER: TRIGGER_SOURCES.WHATSAPP,
    MESSENGER_TRIGGER: TRIGGER_SOURCES.MESSENGER,
    INSTAGRAM_TRIGGER: TRIGGER_SOURCES.INSTAGRAM,
    GMAIL_TRIGGER: TRIGGER_SOURCES.GMAIL,
    TYPEFORM_TRIGGER: TRIGGER_SOURCES.TYPEFORM,
    SHOPIFY_TRIGGER: TRIGGER_SOURCES.SHOPIFY,
    WOOCOMMERCE_TRIGGER: TRIGGER_SOURCES.WOOCOMMERCE,
    RSS_FEED_TRIGGER: TRIGGER_SOURCES.RSS,
    FORM_TRIGGER: TRIGGER_SOURCES.FORM,
    MCP_SERVER_TRIGGER: TRIGGER_SOURCES.MCP,
    ERROR_TRIGGER: TRIGGER_SOURCES.ERROR,
    EXECUTE_WORKFLOW_TRIGGER: TRIGGER_SOURCES.WORKFLOW,
};
