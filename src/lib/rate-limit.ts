import "server-only";

import { NextResponse } from "next/server";
import prisma from "./db";

const WINDOW_SECONDS = 60;

// Requests per minute for one workflow's webhook URL, or one API key
export const WEBHOOK_RATE_LIMIT =
    Number(process.env.WEBHOOK_RATE_LIMIT_PER_MINUTE) || 120;
export const API_RATE_LIMIT =
    Number(process.env.API_RATE_LIMIT_PER_MINUTE) || 120;

/**
 * Counts a request against a fixed one-minute window and says whether it is
 * still within the limit. The counter lives in Postgres so every server
 * instance shares it; the count and the window reset happen in one
 * statement, so concurrent requests cannot both slip through.
 */
export const consumeRateLimit = async (
    key: string,
    limit: number
): Promise<{ allowed: boolean; retryAfterSeconds: number }> => {
    try {
        const rows = await prisma.$queryRaw<
            { count: number; retryAfter: number }[]
        >`
            INSERT INTO "rate_limit" ("key", "count", "windowStart")
            VALUES (${key}, 1, LOCALTIMESTAMP)
            ON CONFLICT ("key") DO UPDATE SET
                "count" = CASE
                    WHEN "rate_limit"."windowStart" < LOCALTIMESTAMP - make_interval(secs => ${WINDOW_SECONDS}::double precision)
                    THEN 1
                    ELSE "rate_limit"."count" + 1
                END,
                "windowStart" = CASE
                    WHEN "rate_limit"."windowStart" < LOCALTIMESTAMP - make_interval(secs => ${WINDOW_SECONDS}::double precision)
                    THEN LOCALTIMESTAMP
                    ELSE "rate_limit"."windowStart"
                END
            RETURNING
                "count",
                CEIL(EXTRACT(EPOCH FROM (
                    "windowStart" + make_interval(secs => ${WINDOW_SECONDS}::double precision) - LOCALTIMESTAMP
                )))::int AS "retryAfter"
        `;

        const row = rows[0];

        return {
            allowed: !row || Number(row.count) <= limit,
            retryAfterSeconds: Math.max(Number(row?.retryAfter) || 1, 1),
        };
    } catch (error) {
        // A broken limiter must not take the webhooks down with it
        console.error("Rate limiter error:", error);

        return { allowed: true, retryAfterSeconds: 0 };
    }
};

/**
 * Returns a 429 response when the caller is over the limit, otherwise null.
 */
export const rateLimitResponse = async (
    key: string,
    limit: number = WEBHOOK_RATE_LIMIT
): Promise<NextResponse | null> => {
    const { allowed, retryAfterSeconds } = await consumeRateLimit(key, limit);

    if (allowed) return null;

    return NextResponse.json(
        {
            success: false,
            error: `Too many requests. The limit is ${limit} per minute.`,
        },
        {
            status: 429,
            headers: { "Retry-After": String(retryAfterSeconds) },
        }
    );
};
