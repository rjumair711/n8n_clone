import "server-only";

import { createId } from "@paralleldrive/cuid2";
import { NonRetriableError } from "inngest";
import {
    getDailyMessageCap,
    messageCapError,
    type MessageChannel,
} from "@/config/message-caps";
import prisma from "./db";

/**
 * Counts `count` messages against the user's daily cap for the channel, or
 * throws when they would go over it. Nothing is counted in that case.
 *
 * The check and the count are one statement, so sends that happen at the
 * same moment cannot both slip through. A message is counted when the node
 * is about to send it: one that then fails at the provider still counts.
 */
export const consumeMessageQuota = async (
    userId: string,
    channel: MessageChannel,
    count = 1
) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { plan: true },
    });

    const plan = user?.plan ?? "FREE";
    const cap = getDailyMessageCap(plan, channel);

    const rows =
        count <= cap
            ? await prisma.$queryRaw<{ count: number }[]>`
                INSERT INTO "message_usage" ("id", "userId", "channel", "day", "count")
                VALUES (${createId()}, ${userId}, ${channel}, (now() AT TIME ZONE 'UTC')::date, ${count})
                ON CONFLICT ("userId", "channel", "day") DO UPDATE
                    SET "count" = "message_usage"."count" + ${count}
                    WHERE "message_usage"."count" + ${count} <= ${cap}
                RETURNING "count"
            `
            : [];

    if (rows.length > 0) return { used: Number(rows[0].count), cap };

    const today = await prisma.$queryRaw<{ count: number }[]>`
        SELECT "count" FROM "message_usage"
        WHERE "userId" = ${userId}
          AND "channel" = ${channel}
          AND "day" = (now() AT TIME ZONE 'UTC')::date
    `;

    throw new NonRetriableError(
        messageCapError({
            plan,
            channel,
            used: Number(today[0]?.count) || 0,
            count,
        })
    );
};
