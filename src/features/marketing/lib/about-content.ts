import {
  LanguagesIcon,
  LockKeyholeIcon,
  type LucideIcon,
  RouteIcon,
  UserCheckIcon,
} from "lucide-react";

// The words of the About page (/about). Like content.ts, every line
// describes something the app does today; nothing here is about the people
// or the company behind it, because the code does not know that.

export const ABOUT_PRINCIPLES: {
  icon: LucideIcon;
  title: string;
  text: string;
}[] = [
  {
    icon: RouteIcon,
    title: "Affordable by design",
    text: "Low-cost models such as DeepSeek, Qwen, Kimi and GLM sit next to OpenAI, Claude and Gemini. A Model Router tries the cheap model first, and AI credits let you start without a key of your own.",
  },
  {
    icon: UserCheckIcon,
    title: "A person stays in control",
    text: "Agent tools are Read, Write or Dangerous. Writes can wait for someone to approve them in the app, by email, Slack, Telegram or WhatsApp, and Dangerous tools are off until you allow them.",
  },
  {
    icon: LockKeyholeIcon,
    title: "Your secrets stay secret",
    text: "Credentials are encrypted with AES-256-GCM and never sent back to the browser. Code runs in a sandbox, and secrets are redacted from execution logs.",
  },
  {
    icon: LanguagesIcon,
    title: "In your language",
    text: "Starter templates come in English, Urdu and Arabic, and the website chat widget can run right to left.",
  },
];
