import {
  siAirtable,
  siAnthropic,
  siDeepseek,
  siDiscord,
  siGithub,
  siGmail,
  siGoogledrive,
  siGooglegemini,
  siGooglesheets,
  siHubspot,
  siJira,
  siKimi,
  siNotion,
  siQwen,
  siShopify,
  siStripe,
  siTelegram,
  siWhatsapp,
} from "simple-icons";

// The integrations on the landing page's strip. Every one of them is a node
// (or a model node) of the app; add one here only when its node exists.
//
// `path` is a simple-icons glyph. simple-icons no longer carries Slack and
// OpenAI, so those two use the app's own logo file as a mask, which draws
// it in one colour like the others.
export type Integration = {
  name: string;
  path?: string;
  mask?: string;
};

export const INTEGRATIONS: Integration[] = [
  { name: "WhatsApp", path: siWhatsapp.path },
  { name: "Telegram", path: siTelegram.path },
  { name: "Gmail", path: siGmail.path },
  { name: "Slack", mask: "/logos/slack.svg" },
  { name: "Discord", path: siDiscord.path },
  { name: "Google Sheets", path: siGooglesheets.path },
  { name: "Notion", path: siNotion.path },
  { name: "Airtable", path: siAirtable.path },
  { name: "Shopify", path: siShopify.path },
  { name: "Google Drive", path: siGoogledrive.path },
  { name: "Stripe", path: siStripe.path },
  { name: "HubSpot", path: siHubspot.path },
  { name: "GitHub", path: siGithub.path },
  { name: "Jira", path: siJira.path },
  { name: "OpenAI", mask: "/logos/openai.svg" },
  { name: "Anthropic", path: siAnthropic.path },
  { name: "Gemini", path: siGooglegemini.path },
  { name: "DeepSeek", path: siDeepseek.path },
  { name: "Qwen", path: siQwen.path },
  { name: "Kimi", path: siKimi.path },
];

// Named under the strip, without an icon: nodes and Chat Model presets that
// have no glyph in simple-icons or no usable logo file
export const MORE_INTEGRATIONS = [
  "Salesforce",
  "Twilio",
  "Postgres",
  "MySQL",
  "WooCommerce",
  "Zhipu GLM",
  "MiniMax",
  "OpenRouter",
  "Ollama",
];
