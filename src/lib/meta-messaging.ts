// What the Messenger and Instagram triggers make of a webhook delivery once
// its signature is verified. Both services send the same shape:
//
//   { object: "page" | "instagram",
//     entry: [{ id, time, messaging: [{ sender, recipient, timestamp,
//                                       message | postback | read | ... }] }] }
//
// No database and no network here, so all of it can be tested.

export type MetaChannel = "messenger" | "instagram";

// The `object` each channel's deliveries carry
export const META_OBJECTS: Record<MetaChannel, string> = {
    messenger: "page",
    instagram: "instagram",
};

export type MetaAttachment = { type: string; url?: string };

export type IncomingMetaMessage = {
    // Meta re-sends an event until it gets a 200: its message id decides
    dedupeKey: string;
    // What the AI Agent and its memory look for
    chatInput: string;
    sessionId: string;
    data: {
        // The person who wrote: a Page-scoped or Instagram-scoped user id
        from: string;
        // The Page or Instagram account that was written to
        accountId: string;
        type: "message" | "postback";
        text: string;
        messageId: string;
        timestamp: number | null;
        attachments: MetaAttachment[];
        // What a tapped quick reply or button carries
        payload?: string;
        replyToMessageId?: string;
        message: unknown;
    };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);

const text = (value: unknown) =>
    typeof value === "string" ? value : typeof value === "number" ? String(value) : "";

const idOf = (value: unknown) => (isRecord(value) ? text(value.id) : "");

const readAttachments = (value: unknown): MetaAttachment[] =>
    (Array.isArray(value) ? value : []).filter(isRecord).map((attachment) => {
        const url = isRecord(attachment.payload) ? text(attachment.payload.url) : "";

        return {
            type: text(attachment.type) || "file",
            // Only a web address is passed on as one
            ...(/^https:\/\//i.test(url) ? { url } : {}),
        };
    });

/**
 * The messages of a delivery that should start a run: text, attachments,
 * quick replies and button taps from people. Left out are the account's own
 * messages (echoes), deleted messages, and read and delivery receipts.
 */
export const parseMetaMessages = (
    channel: MetaChannel,
    body: unknown
): IncomingMetaMessage[] => {
    if (!isRecord(body) || body.object !== META_OBJECTS[channel]) return [];

    const messages: IncomingMetaMessage[] = [];

    for (const entry of Array.isArray(body.entry) ? body.entry : []) {
        if (!isRecord(entry)) continue;

        for (const event of Array.isArray(entry.messaging) ? entry.messaging : []) {
            if (!isRecord(event)) continue;

            const from = idOf(event.sender);
            const accountId = idOf(event.recipient) || text(entry.id);

            // Something the account itself sent is never answered: a bot
            // would otherwise talk to itself
            if (!from || from === text(entry.id)) continue;

            const timestamp =
                typeof event.timestamp === "number" ? event.timestamp : null;
            const base = { from, accountId, timestamp, message: event };

            if (isRecord(event.message)) {
                const message = event.message;
                if (message.is_echo === true || message.is_deleted === true) continue;

                const messageId = text(message.mid);
                const content = text(message.text);
                const attachments = readAttachments(message.attachments);
                const payload = isRecord(message.quick_reply)
                    ? text(message.quick_reply.payload)
                    : "";
                const replyTo = isRecord(message.reply_to)
                    ? text(message.reply_to.mid)
                    : "";

                if (!messageId || (!content && attachments.length === 0 && !payload)) continue;

                messages.push({
                    dedupeKey: messageId,
                    chatInput: content,
                    sessionId: `${channel}-${from}`,
                    data: {
                        ...base,
                        type: "message",
                        text: content,
                        messageId,
                        attachments,
                        ...(payload ? { payload } : {}),
                        ...(replyTo ? { replyToMessageId: replyTo } : {}),
                    },
                });
                continue;
            }

            if (isRecord(event.postback)) {
                const postback = event.postback;
                const payload = text(postback.payload);
                const title = text(postback.title) || payload;
                const messageId = text(postback.mid);

                if (!title) continue;

                messages.push({
                    // An old Page may send no id for a button tap
                    dedupeKey: messageId || `postback:${from}:${timestamp ?? ""}:${payload}`,
                    chatInput: title,
                    sessionId: `${channel}-${from}`,
                    data: {
                        ...base,
                        type: "postback",
                        text: title,
                        messageId,
                        attachments: [],
                        ...(payload ? { payload } : {}),
                    },
                });
            }
        }
    }

    return messages;
};
