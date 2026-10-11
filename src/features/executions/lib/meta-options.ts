// Settings shared by the Messenger and Instagram nodes' dialogs (in the
// browser) and their executors, so nothing here may import server code.

export const GRAPH_API_VERSION = "v21.0";

// Meta's limits for one message and one caption
export const MESSENGER_MAX_TEXT = 2000;
export const INSTAGRAM_MAX_TEXT = 1000;
export const INSTAGRAM_MAX_CAPTION = 2200;

// How an Instagram professional account is connected to the Meta app. It
// decides which host is called and which kind of token is used.
export const INSTAGRAM_CONNECTIONS = [
  { value: "facebook", label: "Through a Facebook Page (Page access token)" },
  { value: "instagram", label: "Instagram Login (Instagram access token)" },
];

export const GRAPH_ORIGINS: Record<string, string> = {
  facebook: "https://graph.facebook.com",
  instagram: "https://graph.instagram.com",
};

// Free text only reaches someone who wrote in the last 24 hours. A tag
// widens that for the cases Meta allows.
export const DEFAULT_REPLY_TYPE = "response";

export const MESSENGER_REPLY_TYPES = [
  { value: DEFAULT_REPLY_TYPE, label: "Reply (within 24 hours of their message)" },
  { value: "HUMAN_AGENT", label: "Human agent (within 7 days; needs Meta's approval)" },
  { value: "POST_PURCHASE_UPDATE", label: "Post-purchase update" },
  { value: "CONFIRMED_EVENT_UPDATE", label: "Confirmed event update" },
  { value: "ACCOUNT_UPDATE", label: "Account update" },
];

export const INSTAGRAM_REPLY_TYPES = MESSENGER_REPLY_TYPES.slice(0, 2);
