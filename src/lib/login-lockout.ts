import "server-only";

import { createHash } from "crypto";
import prisma from "./db";

// Wrong passwords in a row for one account before sign-in is locked, and
// for how long
export const LOGIN_MAX_FAILED_ATTEMPTS = 10;
export const LOGIN_LOCK_MINUTES = 15;

// Sign-in and two-factor code attempts per minute from one IP address
export const SIGN_IN_RATE_LIMIT =
    Number(process.env.SIGN_IN_RATE_LIMIT_PER_MINUTE) || 20;

const LOCK_SECONDS = LOGIN_LOCK_MINUTES * 60;

/**
 * The counter's key in the rate_limit table. The address is hashed: the
 * table also gets a row for addresses that have no account, and has no need
 * to hold them in the clear.
 */
export const loginAttemptKey = (email: string) =>
    "login-fail:" +
    createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

// The same answer whether or not the address has an account
export const loginLockedMessage = (secondsLeft: number) => {
    const minutes = Math.max(Math.ceil(secondsLeft / 60), 1);

    return `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
};

/**
 * Seconds until the account can try to sign in again, or 0 when it is not
 * locked.
 */
export const getLoginLockSeconds = async (email: string): Promise<number> => {
    try {
        const rows = await prisma.$queryRaw<{ secondsLeft: number }[]>`
            SELECT CEIL(EXTRACT(EPOCH FROM (
                "windowStart" + make_interval(secs => ${LOCK_SECONDS}::double precision) - LOCALTIMESTAMP
            )))::int AS "secondsLeft"
            FROM "rate_limit"
            WHERE "key" = ${loginAttemptKey(email)}
              AND "count" >= ${LOGIN_MAX_FAILED_ATTEMPTS}
              AND "windowStart" > LOCALTIMESTAMP - make_interval(secs => ${LOCK_SECONDS}::double precision)
        `;

        return Math.max(Number(rows[0]?.secondsLeft) || 0, 0);
    } catch (error) {
        // Like the rate limiter: a broken counter must not stop every sign-in
        console.error("Login lockout error:", error);

        return 0;
    }
};

/**
 * Counts a wrong password. Failures are counted for LOGIN_LOCK_MINUTES from
 * the first one; the one that reaches the limit restarts the clock, so the
 * lock lasts the full time from that attempt. One statement, so attempts
 * made at the same moment are all counted.
 */
export const recordFailedLogin = async (email: string) => {
    try {
        await prisma.$executeRaw`
            INSERT INTO "rate_limit" ("key", "count", "windowStart")
            VALUES (${loginAttemptKey(email)}, 1, LOCALTIMESTAMP)
            ON CONFLICT ("key") DO UPDATE SET
                "count" = CASE
                    WHEN "rate_limit"."windowStart" < LOCALTIMESTAMP - make_interval(secs => ${LOCK_SECONDS}::double precision)
                    THEN 1
                    ELSE "rate_limit"."count" + 1
                END,
                "windowStart" = CASE
                    WHEN "rate_limit"."windowStart" < LOCALTIMESTAMP - make_interval(secs => ${LOCK_SECONDS}::double precision)
                    THEN LOCALTIMESTAMP
                    WHEN "rate_limit"."count" + 1 = ${LOGIN_MAX_FAILED_ATTEMPTS}
                    THEN LOCALTIMESTAMP
                    ELSE "rate_limit"."windowStart"
                END
        `;
    } catch (error) {
        console.error("Login lockout error:", error);
    }
};

// A correct password starts the count again
export const clearFailedLogins = async (email: string) => {
    try {
        await prisma.$executeRaw`
            DELETE FROM "rate_limit" WHERE "key" = ${loginAttemptKey(email)}
        `;
    } catch (error) {
        console.error("Login lockout error:", error);
    }
};
