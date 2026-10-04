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
} as const;

const LABELS: Record<string, string> = {
    [TRIGGER_SOURCES.MANUAL]: "Manual",
    [TRIGGER_SOURCES.MANUAL_TEST]: "Test run from editor",
    [TRIGGER_SOURCES.CHAT]: "Chat",
    [TRIGGER_SOURCES.SCHEDULE]: "Schedule",
    [TRIGGER_SOURCES.WEBHOOK]: "Webhook",
    [TRIGGER_SOURCES.STRIPE]: "Stripe",
    [TRIGGER_SOURCES.GOOGLE_FORM]: "Google Form",
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
};
