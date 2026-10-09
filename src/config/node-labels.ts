// Display names for node types whose name is not just the type in title case
const NODE_LABELS: Record<string, string> = {
    INITIAL: "Start",
    HTTP_REQUEST: "HTTP Request",
    AI_AGENT: "AI Agent",
    OPENAI: "OpenAI",
    DEEPSEEK: "DeepSeek",
    BUFFER_MEMORY: "Memory",
    CODE: "JavaScript Code",
    IF: "IF",
    EMAIL_SEND: "Email",
    DATE_TIME: "Date & Time",
    GITHUB: "GitHub",
    WHATSAPP: "WhatsApp",
    GOOGLE_FORM_TRIGGER: "Google Form Trigger",
    WHATSAPP_TRIGGER: "WhatsApp Trigger",
    EXECUTE_WORKFLOW_TRIGGER: "When Executed by Another Workflow",
    RESPOND_TO_WEBHOOK: "Respond to Webhook",
    STOP_AND_ERROR: "Stop and Error",
    WEBHOOK_RESPONSE: "Webhook Callback",
    MCP_CLIENT_TOOL: "MCP Client",
    HUBSPOT: "HubSpot",
    SSH: "SSH",
    PDF_GENERATOR: "PDF Generator",
    CONVERT_TO_FILE: "Convert to File",
    EXTRACT_FROM_FILE: "Extract from File",
    RSS_READ: "RSS Read",
    RSS_FEED_TRIGGER: "RSS Feed Trigger",
    MYSQL: "MySQL",
    SENDGRID: "SendGrid",
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
