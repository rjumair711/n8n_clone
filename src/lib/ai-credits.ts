import "server-only";

import { Prisma } from "@prisma/client";
import { NonRetriableError } from "inngest";
import {
    CREDITS_PER_USD,
    INCLUDED_CREDENTIAL_NAME,
    buildCreditStatus,
    creditsUsedUpMessage,
    getPurchasedCharge,
    type CreditPack,
    type CreditStatus,
} from "@/config/ai-credits";
import { getChatModelProvider } from "@/features/executions/lib/chat-model-providers";
import { normalizePriceKey, startOfUtcMonth } from "./ai-cost";
import { getAppUrl } from "./app-url";
import prisma from "./db";

// The database side of the built-in AI credits. The rules and the numbers
// are in src/config/ai-credits.ts.

type Db = Prisma.TransactionClient | typeof prisma;

// What the month's included calls cost so far
const getMonthIncludedUsd = async (db: Db, userId: string) => {
    const sum = await db.aiUsage.aggregate({
        where: { userId, included: true, createdAt: { gte: startOfUtcMonth() } },
        _sum: { costUsd: true },
    });

    return Number(sum._sum.costUsd ?? 0);
};

/**
 * A user's credits right now: what is left of the month's allowance and of
 * what they bought.
 */
export const getCreditStatus = async (
    userId: string,
    db: Db = prisma
): Promise<CreditStatus> => {
    const [user, usedUsd] = await Promise.all([
        db.user.findUniqueOrThrow({
            where: { id: userId },
            select: { plan: true, aiCreditBalanceUsd: true },
        }),
        getMonthIncludedUsd(db, userId),
    ]);

    return buildCreditStatus({
        plan: user.plan,
        usedUsd,
        purchasedUsd: Number(user.aiCreditBalanceUsd),
    });
};

/**
 * The hard stop: what to tell the user when they have no credits left, or
 * null when an included call may go on.
 *
 * It is asked before a node calls a model, not during the call, so the
 * last call can take the balance below zero by what it cost.
 */
export const getCreditProblem = async (userId: string): Promise<string | null> => {
    const status = await getCreditStatus(userId);

    return status.availableUsd > 0
        ? null
        : creditsUsedUpMessage({ plan: status.plan, appUrl: getAppUrl() });
};

/**
 * Takes an included call's cost from the user's credits: first from the
 * month's allowance, which is only counted, then from bought credits, which
 * are a balance. Call it before the call's usage row is written, in the
 * same transaction, so the row is not counted against its own allowance.
 */
export const chargeIncludedCost = async (
    db: Db,
    userId: string,
    costUsd: number | null
) => {
    if (!costUsd || costUsd <= 0) return;

    const status = await getCreditStatus(userId, db);
    const fromPurchased = getPurchasedCharge(costUsd, status.allowanceLeftUsd);

    if (fromPurchased <= 0) return;

    // One statement, so two calls ending together cannot both spend the
    // same credits; never below zero
    await db.$executeRaw`
        UPDATE "user"
        SET "aiCreditBalanceUsd" = GREATEST("aiCreditBalanceUsd" - ${fromPurchased}::decimal, 0)
        WHERE "id" = ${userId}
    `;
};

/**
 * The providers and models of "RXJ AI (included)" that are switched on, for
 * the pickers. Never the keys.
 */
export const listIncludedProviders = async () => {
    const rows = await prisma.platformAiProvider.findMany({
        where: { enabled: true },
        orderBy: { provider: "asc" },
        select: { provider: true, models: true },
    });

    return rows.flatMap((row) => {
        const preset = getChatModelProvider(row.provider);

        return preset && row.models.length > 0
            ? [{ provider: row.provider, label: preset.label, models: row.models }]
            : [];
    });
};

const describeIncluded = (rows: { provider: string; models: string[] }[]) =>
    rows.length === 0
        ? "No models are included at the moment."
        : `Included: ${rows
              .map((row) => `${getChatModelProvider(row.provider)?.label ?? row.provider} (${row.models.join(", ")})`)
              .join("; ")}.`;

/**
 * For a node that is about to call included models: checks that each one is
 * offered and has a price, and that the user has credits left. Returns the
 * platform's keys, still encrypted, by provider.
 *
 * Every refusal is final (NonRetriableError): trying again changes nothing.
 */
export const loadIncludedKeys = async ({
    label,
    userId,
    models,
}: {
    label: string;
    userId: string;
    models: { provider: string; model: string }[];
}): Promise<Record<string, string>> => {
    const rows = await prisma.platformAiProvider.findMany({ where: { enabled: true } });
    const keys: Record<string, string> = {};

    for (const { provider, model } of models) {
        const row = rows.find((entry) => entry.provider === provider);

        if (!row || !getChatModelProvider(provider) || !row.models.includes(model)) {
            throw new NonRetriableError(
                `${label}: the model "${model}" of ${getChatModelProvider(provider)?.label ?? provider} is not part of ${INCLUDED_CREDENTIAL_NAME}. ${describeIncluded(rows)} Pick one of those, or your own API key credential.`
            );
        }

        // Without a price the call would cost no credits at all
        const price = await prisma.modelPrice.findUnique({
            where: {
                provider_model: {
                    provider: normalizePriceKey(provider),
                    model: normalizePriceKey(model),
                },
            },
            select: { id: true },
        });

        if (!price) {
            throw new NonRetriableError(
                `${label}: the included model "${model}" has no price yet, so it cannot be used. An admin has to add it to the price table in Settings.`
            );
        }

        keys[provider] = row.apiKey;
    }

    const problem = await getCreditProblem(userId);
    if (problem) throw new NonRetriableError(`${label}: ${problem}`);

    return keys;
};

/**
 * Adds the credits of a paid credit-pack order to the user's balance.
 * Returns false when the order was counted before: Polar may send an event
 * more than once, and two webhook addresses may both receive it.
 */
export const grantCreditPurchase = async ({
    orderId,
    userId,
    pack,
}: {
    orderId: string;
    userId: string;
    pack: CreditPack;
}): Promise<boolean> => {
    const amountUsd = pack.credits / CREDITS_PER_USD;

    try {
        await prisma.$transaction([
            // The unique order id is what makes this safe to repeat
            prisma.aiCreditPurchase.create({
                data: { userId, polarOrderId: orderId, productId: pack.productId, amountUsd },
            }),
            prisma.user.update({
                where: { id: userId },
                data: { aiCreditBalanceUsd: { increment: amountUsd } },
            }),
        ]);

        return true;
    } catch (error) {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
        ) {
            return false;
        }

        throw error;
    }
};
