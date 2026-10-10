// How many messages a user may send per day through the nodes that reach
// people outside the app. This is the one place the numbers live. No server
// imports: the rules are pure functions so they can be tested.
//
// The plan is what counts, not the free trial: a trial unlocks the nodes of
// the paid plans, and these caps are what keeps a trial account from being
// used to send in bulk.

export type MessageChannel = "email" | "whatsapp" | "twilio" | "telegram";

type Plan = "FREE" | "BEGINNER" | "INTERMEDIATE" | "PRO";

// Messages per user per day (UTC). For email every recipient counts as one.
export const DAILY_MESSAGE_CAPS: Record<Plan, Record<MessageChannel, number>> = {
  FREE: { email: 20, whatsapp: 20, twilio: 10, telegram: 50 },
  BEGINNER: { email: 100, whatsapp: 50, twilio: 25, telegram: 200 },
  INTERMEDIATE: { email: 1000, whatsapp: 500, twilio: 250, telegram: 2000 },
  PRO: { email: 10000, whatsapp: 5000, twilio: 2500, telegram: 20000 },
};

const PLAN_NAMES: Record<Plan, string> = {
  FREE: "Free",
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  PRO: "Pro",
};

// What one message is called in the error, singular and plural
const CHANNEL_WORDS: Record<MessageChannel, [string, string]> = {
  email: ["email", "emails"],
  whatsapp: ["WhatsApp message", "WhatsApp messages"],
  twilio: ["Twilio message", "Twilio messages"],
  telegram: ["Telegram message", "Telegram messages"],
};

// The nodes that send, their channel, and (for nodes that also read) the
// operations that send. The fields listed hold recipients.
const SENDING_NODES: Record<
  string,
  { channel: MessageChannel; operations?: string[]; recipientFields?: string[] }
> = {
  EMAIL_SEND: { channel: "email", recipientFields: ["recipient"] },
  GMAIL: {
    channel: "email",
    // Search, get and mark as read send nothing
    operations: ["send_email", "reply"],
    recipientFields: ["to", "cc", "bcc"],
  },
  RESEND: { channel: "email", recipientFields: ["to", "cc", "bcc"] },
  SENDGRID: { channel: "email", recipientFields: ["to", "cc", "bcc"] },
  WHATSAPP: { channel: "whatsapp" },
  // SMS and WhatsApp through Twilio
  TWILIO: { channel: "twilio" },
  TELEGRAM: { channel: "telegram" },
};

const countAddresses = (text: string) =>
  text.split(/[,;]/).filter((address) => address.trim()).length;

/**
 * What running a node will send: the channel and how many messages, or null
 * when it sends nothing (another kind of node, or a Gmail search). `render`
 * fills in the {{ }} expressions of a field.
 */
export const getMessageSend = (
  nodeType: string,
  data: Record<string, unknown> | null | undefined,
  render: (text: string) => string = (text) => text
): { channel: MessageChannel; count: number } | null => {
  const node = SENDING_NODES[nodeType];
  if (!node) return null;

  const operation = typeof data?.operation === "string" ? data.operation : "";
  if (node.operations && !node.operations.includes(operation)) return null;

  // A Gmail reply goes to the sender of the original, whatever "to" holds
  const fields = operation === "reply" ? [] : node.recipientFields ?? [];

  let count = 0;
  for (const field of fields) {
    const value = data?.[field];
    if (typeof value !== "string" || !value.trim()) continue;

    try {
      count += countAddresses(render(value));
    } catch {
      // The node itself reports a field it cannot render
      count += 1;
    }
  }

  return { channel: node.channel, count: Math.max(count, 1) };
};

export const getDailyMessageCap = (plan: string, channel: MessageChannel): number =>
  (DAILY_MESSAGE_CAPS[plan as Plan] ?? DAILY_MESSAGE_CAPS.FREE)[channel];

/**
 * The error shown when a send would go over the cap.
 */
export const messageCapError = ({
  plan,
  channel,
  used,
  count,
}: {
  plan: string;
  channel: MessageChannel;
  used: number;
  count: number;
}) => {
  const cap = getDailyMessageCap(plan, channel);
  const [one, many] = CHANNEL_WORDS[channel];
  const planName = PLAN_NAMES[plan as Plan] ?? PLAN_NAMES.FREE;

  const left = Math.max(cap - used, 0);
  const attempt =
    count > 1 ? ` This send has ${count} recipients and ${left} ${left === 1 ? "is" : "are"} left.` : "";
  const upgrade = plan === "PRO" ? "" : " Upgrade your plan to send more.";

  return `Daily ${one} limit reached: the ${planName} plan allows ${cap} ${cap === 1 ? one : many} per day and ${used} ${used === 1 ? "was" : "were"} sent today.${attempt} The count starts again at 00:00 UTC.${upgrade}`;
};
