// Display names for node types whose name is not just the type in title case
const NODE_LABELS: Record<string, string> = {
    INITIAL: "Start",
    HTTP_REQUEST: "HTTP Request",
    AI_AGENT: "AI Agent",
    OPENAI: "OpenAI",
    BUFFER_MEMORY: "Memory",
    CODE: "JavaScript Code",
    IF: "IF",
    EMAIL_SEND: "Email",
    DATE_TIME: "Date & Time",
    GITHUB: "GitHub",
    WHATSAPP: "WhatsApp",
    GOOGLE_FORM_TRIGGER: "Google Form Trigger",
};

// "MANUAL_TRIGGER" -> "Manual Trigger", "AI_AGENT" -> "AI Agent"
export const getNodeLabel = (nodeType?: string | null): string => {
    if (!nodeType) return "Node";

    return (
        NODE_LABELS[nodeType] ??
        nodeType
            .toLowerCase()
            .split("_")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ")
    );
};
