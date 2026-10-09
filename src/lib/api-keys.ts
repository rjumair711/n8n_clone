import "server-only";

import { createHash, randomBytes } from "crypto";
import { type NextRequest, NextResponse } from "next/server";
import type { User } from "@prisma/client";
import prisma from "./db";
import { PLAN_LIMITS } from "@/config/plans";
import { API_RATE_LIMIT, rateLimitResponse } from "./rate-limit";
import {
    type ApiScope,
    hasScope,
    isKeyExpired,
    missingScopeMessage,
} from "./api-key-scopes";

const KEY_PREFIX = "rxj_";

// Only this hash is stored: a leaked database does not leak usable keys
export const hashApiKey = (key: string) =>
    createHash("sha256").update(key, "utf8").digest("hex");

export const generateApiKey = () => {
    const key = `${KEY_PREFIX}${randomBytes(32).toString("hex")}`;

    return {
        key,
        keyHash: hashApiKey(key),
        // Enough to recognise a key in the list, not enough to use it
        prefix: key.slice(0, KEY_PREFIX.length + 6),
    };
};

// API access is a plan feature; an active free trial unlocks it like the
// plan-locked nodes
export const hasApiAccess = (user: Pick<User, "plan" | "trialEndsAt">) =>
    PLAN_LIMITS[user.plan]?.features.apiAccess ||
    (!!user.trialEndsAt && new Date(user.trialEndsAt) > new Date());

const apiError = (status: number, message: string) =>
    NextResponse.json({ error: message }, { status });

/**
 * Identifies the caller of a /api/v1 route from `Authorization: Bearer <key>`
 * or `X-API-Key: <key>` and checks that the key may do what the route does.
 * Returns the user, or the error response to send.
 */
export const authenticateApiRequest = async (
    request: NextRequest,
    scope: ApiScope
): Promise<{ user: User } | { response: NextResponse }> => {
    const header = request.headers.get("authorization") || "";
    const key = (
        header.toLowerCase().startsWith("bearer ")
            ? header.slice(7)
            : request.headers.get("x-api-key") || ""
    ).trim();

    if (!key.startsWith(KEY_PREFIX)) {
        return {
            response: apiError(
                401,
                "Missing API key. Send it as 'Authorization: Bearer <key>' or 'X-API-Key: <key>'."
            ),
        };
    }

    const apiKey = await prisma.apiKey.findUnique({
        where: { keyHash: hashApiKey(key) },
        include: { user: true },
    });

    if (!apiKey) {
        return { response: apiError(401, "Invalid API key.") };
    }

    // Per key (API_RATE_LIMIT_PER_MINUTE). Only keys that exist are counted,
    // so made-up keys cannot fill the rate limit table.
    const limited = await rateLimitResponse(`api:${apiKey.id}`, API_RATE_LIMIT);
    if (limited) return { response: limited };

    if (isKeyExpired(apiKey.expiresAt)) {
        return { response: apiError(401, "This API key has expired.") };
    }

    if (!hasApiAccess(apiKey.user)) {
        return {
            response: apiError(
                403,
                "API access is not included in your plan. Upgrade to use the API."
            ),
        };
    }

    if (!hasScope(apiKey.scopes, scope)) {
        return { response: apiError(403, missingScopeMessage(scope)) };
    }

    // Not awaited: a failed timestamp update must not fail the request
    void prisma.apiKey
        .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
        .catch(() => {});

    return { user: apiKey.user };
};

export { apiError };
