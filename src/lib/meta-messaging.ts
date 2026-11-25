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

// =========================================================================
// COMMENTS
// =========================================================================
// A new comment on a post of the Page or the Instagram account arrives as a
// change, not as a messaging event:
//
//   Facebook Page  { object: "page", entry: [{ id, time, changes: [{
//                    field: "feed", value: { item: "comment", verb: "add",
//                    comment_id, post_id, parent_id, message,
//                    from: { id, name }, created_time } }] }] }
//   Instagram      { object: "instagram", entry: [{ id, time, changes: [{
//                    field: "comments", value: { id, text, parent_id,
//                    from: { id, username }, media: { id,
//                    media_product_type } } }] }] }

export type IncomingMetaComment = {
    // Meta re-sends an event until it gets a 200: the comment id decides
    dedupeKey: string;
    chatInput: string;
    sessionId: string;
    data: {
        // The person who commented
        from: string;
        // Their name on Facebook, their user name on Instagram
        fromName: string;
        // The Page or Instagram account whose post it is
        accountId: string;
        type: "comment";
        text: string;
        // What Reply to Comment, Send Private Reply and Hide Comment need
        commentId: string;
        // The post (Facebook) or media (Instagram) commented on
        postId: string;
        // Set when the comment answers another comment
        parentId?: string;
        // Instagram: FEED, REELS, AD...
        mediaType?: string;
        timestamp: number | null;
        comment: unknown;
    };
};

/**
 * The new comments of a delivery: on Facebook a "feed" change with a comment
 * added, on Instagram a "comments" change. Left out are the account's own
 * comments (its replies would otherwise start the workflow again), edited
 * and removed comments, and every other kind of change (likes, new posts).
 */
export const parseMetaComments = (
    channel: MetaChannel,
    body: unknown
): IncomingMetaComment[] => {
    if (!isRecord(body) || body.object !== META_OBJECTS[channel]) return [];

    const comments: IncomingMetaComment[] = [];

    for (const entry of Array.isArray(body.entry) ? body.entry : []) {
        if (!isRecord(entry)) continue;

        const accountId = text(entry.id);
        const entryTime = typeof entry.time === "number" ? entry.time : null;

        for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
            if (!isRecord(change) || !isRecord(change.value)) continue;

            const value = change.value;
            const from = isRecord(value.from) ? value.from : {};
            const fromId = text(from.id);

            let comment: Omit<IncomingMetaComment["data"], "from" | "accountId" | "type" | "comment"> | null = null;

            if (channel === "messenger" && change.field === "feed") {
                if (value.item !== "comment" || value.verb !== "add") continue;

                const createdTime = typeof value.created_time === "number" ? value.created_time : null;
                comment = {
                    fromName: text(from.name),
                    text: text(value.message),
                    commentId: text(value.comment_id),
                    postId: text(value.post_id),
                    // A comment on the post itself has the post as its parent
                    ...(text(value.parent_id) && text(value.parent_id) !== text(value.post_id)
                        ? { parentId: text(value.parent_id) }
                        : {}),
                    // Facebook sends seconds
                    timestamp: createdTime !== null ? createdTime * 1000 : entryTime,
                };
            }

            if (channel === "instagram" && change.field === "comments") {
                const media = isRecord(value.media) ? value.media : {};
                comment = {
                    fromName: text(from.username),
                    text: text(value.text),
                    commentId: text(value.id),
                    postId: text(media.id),
                    ...(text(value.parent_id) ? { parentId: text(value.parent_id) } : {}),
                    ...(text(media.media_product_type) ? { mediaType: text(media.media_product_type) } : {}),
                    timestamp: entryTime,
                };
            }

            // The account's own comment, e.g. the reply the workflow just made
            if (!comment || !comment.commentId || !fromId || fromId === accountId) continue;

            comments.push({
                dedupeKey: `comment:${comment.commentId}`,
                chatInput: comment.text,
                sessionId: `${channel}-${fromId}`,
                data: {
                    ...comment,
                    from: fromId,
                    accountId,
                    type: "comment",
                    comment: value,
                },
            });
        }
    }

    return comments;
};

// =========================================================================
// WHICH EVENTS A TRIGGER NODE TAKES
// =========================================================================
export const META_TRIGGER_ON = [
    { value: "messages", label: "Messages" },
    { value: "comments", label: "Comments on posts" },
    { value: "both", label: "Messages and comments" },
];

export type MetaTriggerFilter = {
    // "messages" (also when empty: triggers saved before comments existed),
    // "comments" or "both"
    triggerOn?: string;
    // Comments only: comma-separated words; a comment must contain one
    keywords?: string;
    // Comments only: comma-separated post or media ids
    postIds?: string;
};

const listOf = (value: string | undefined) =>
    (value ?? "")
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean);

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Whether a comment contains one of the keywords: as a whole word, ignoring
 * case, so "price" matches "Price?" and "PRICE please" but not "priceless".
 * Works for Urdu and Arabic words too. No keywords means every comment.
 */
export const matchesKeywords = (commentText: string, keywords: string | undefined) => {
    const words = listOf(keywords);
    if (words.length === 0) return true;

    return words.some((word) =>
        new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(word)}(?![\\p{L}\\p{N}_])`, "iu").test(commentText)
    );
};

/** Whether a trigger node with these settings starts a run for an event. */
export const metaTriggerAccepts = (
    filter: MetaTriggerFilter | null | undefined,
    event: IncomingMetaMessage | IncomingMetaComment
) => {
    const on = filter?.triggerOn === "comments" || filter?.triggerOn === "both" ? filter.triggerOn : "messages";

    if (event.data.type !== "comment") return on !== "comments";
    if (on === "messages") return false;

    const posts = listOf(filter?.postIds);
    // A Facebook post id is "<page id>_<post id>"; either form may be typed
    const postId = event.data.postId;
    if (posts.length > 0 && !posts.some((post) => post === postId || postId.endsWith(`_${post}`))) {
        return false;
    }

    return matchesKeywords(event.data.text, filter?.keywords);
};
