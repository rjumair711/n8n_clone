// Built-in AI credits: "RXJ AI (included)" lets a user run cheap models
// with the platform's own provider keys, paid with credits. Every number
// that decides what a plan gets is in this file. No server imports: the
// pages use it, and the rules are pure functions so they can be tested
// without a database. The database side is src/lib/ai-credits.ts.

import { CHAT_MODEL_PROVIDERS } from "@/features/executions/lib/chat-model-providers";

// What a node (or "Build with AI") has as its credential when it uses the
// platform's key. It is not the id of a stored credential.
export const INCLUDED_CREDENTIAL_ID = "rxj-ai";
export const INCLUDED_CREDENTIAL_NAME = "RXJ AI (included)";

export const isIncludedCredential = (credentialId: string | null | undefined) =>
  credentialId === INCLUDED_CREDENTIAL_ID;

// One credit is a tenth of a US cent of model cost, at the prices of the
// price table (Settings, admins). 1,000 credits are one dollar.
export const CREDITS_PER_USD = 1000;

// Credits a plan gets every calendar month (UTC). They do not carry over.
// A free trial does not change the number: it is the plan's.
export const PLAN_AI_CREDITS: Record<string, number> = {
  FREE: 100,
  BEGINNER: 1_000,
  INTERMEDIATE: 5_000,
  PRO: 20_000,
};

export const getPlanAllowanceUsd = (plan: string) =>
  (PLAN_AI_CREDITS[plan] ?? 0) / CREDITS_PER_USD;

export const usdToCredits = (usd: number | null | undefined) =>
  Math.round((Number(usd) || 0) * CREDITS_PER_USD * 100) / 100;

// "1,250" or "0.4": whole credits unless there is less than ten left
export const formatCredits = (usd: number | null | undefined) => {
  const credits = usdToCredits(usd);

  return credits.toLocaleString("en-US", {
    maximumFractionDigits: Math.abs(credits) < 10 ? 1 : 0,
  });
};

// Providers an admin can add: the Chat Model presets that have an address
// of their own. A custom or local address is not a platform provider.
export const INCLUDED_PROVIDER_OPTIONS = CHAT_MODEL_PROVIDERS.filter(
  (provider) => provider.baseUrl && provider.value !== "ollama"
).map(({ value, label }) => ({ value, label }));

export const isIncludedProviderOption = (provider: string) =>
  INCLUDED_PROVIDER_OPTIONS.some((option) => option.value === provider);

export const MAX_INCLUDED_MODELS = 20;

/**
 * The model IDs typed into the admin form, one per line or comma-separated.
 */
export const parseIncludedModels = (text: string | string[]): string[] => [
  ...new Set(
    (Array.isArray(text) ? text : text.split(/[\n,]/))
      .map((model) => model.trim())
      .filter((model) => model && model.length <= 200)
  ),
].slice(0, MAX_INCLUDED_MODELS);

export type CreditStatus = {
  plan: string;
  // All in US dollars
  allowanceUsd: number;
  usedUsd: number;
  allowanceLeftUsd: number;
  purchasedUsd: number;
  availableUsd: number;
};

export const buildCreditStatus = ({
  plan,
  usedUsd,
  purchasedUsd,
}: {
  plan: string;
  // What the month's included calls cost so far
  usedUsd: number;
  // Bought credits that are left
  purchasedUsd: number;
}): CreditStatus => {
  const allowanceUsd = getPlanAllowanceUsd(plan);
  const allowanceLeftUsd = Math.max(allowanceUsd - usedUsd, 0);
  const bought = Math.max(purchasedUsd, 0);

  return {
    plan,
    allowanceUsd,
    usedUsd,
    allowanceLeftUsd,
    purchasedUsd: bought,
    availableUsd: allowanceLeftUsd + bought,
  };
};

/**
 * How much of a call's cost is taken from bought credits: whatever the
 * month's allowance no longer covers. The allowance is always used first.
 */
export const getPurchasedCharge = (costUsd: number, allowanceLeftUsd: number) =>
  Math.max(costUsd - Math.max(allowanceLeftUsd, 0), 0);

const PLAN_NAMES: Record<string, string> = {
  FREE: "Free",
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  PRO: "Pro",
};

/**
 * What a user reads when a call is refused because nothing is left. `appUrl`
 * is the app's public address: the message is also shown in execution logs,
 * where a link has to be written out.
 */
export const creditsUsedUpMessage = ({
  plan,
  appUrl,
}: {
  plan: string;
  appUrl: string;
}) =>
  `${INCLUDED_CREDENTIAL_NAME} credits are used up: the ${PLAN_NAMES[plan] ?? plan} plan includes ${(
    PLAN_AI_CREDITS[plan] ?? 0
  ).toLocaleString("en-US")} credits a month and you have no bought credits left. Upgrade your plan or buy credits at ${appUrl}/billing, or pick your own API key credential on the node. The monthly credits start again on the 1st (UTC).`;

export type CreditPack = {
  // The Polar product (a one-time purchase)
  productId: string;
  credits: number;
};

const MAX_PACK_CREDITS = 100_000_000;

/**
 * The credit packs on sale, from POLAR_CREDIT_PACKS: a comma-separated
 * list of `<Polar product id>:<credits>`, for example
 * `prod_abc:5000,prod_def:25000`. Entries that cannot be read are left out.
 */
export const parseCreditPacks = (value: string | undefined): CreditPack[] => {
  const packs = new Map<string, CreditPack>();

  for (const entry of (value ?? "").split(",")) {
    const separator = entry.lastIndexOf(":");
    if (separator <= 0) continue;

    const productId = entry.slice(0, separator).trim();
    const credits = Number(entry.slice(separator + 1).trim());

    if (
      productId &&
      Number.isInteger(credits) &&
      credits > 0 &&
      credits <= MAX_PACK_CREDITS
    ) {
      packs.set(productId, { productId, credits });
    }
  }

  return [...packs.values()].sort((a, b) => a.credits - b.credits);
};

export const getCreditPacks = () => parseCreditPacks(process.env.POLAR_CREDIT_PACKS);

type PolarOrder = {
  id?: unknown;
  paid?: unknown;
  // The webhook's JSON (snake_case) or the SDK's object (camelCase)
  product_id?: unknown;
  productId?: unknown;
  product?: { id?: unknown } | null;
  metadata?: Record<string, unknown> | null;
  customer?: {
    external_id?: unknown;
    externalId?: unknown;
  } | null;
};

const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/**
 * What a paid Polar order means for credits: which pack, for which user.
 * Null when the event is not a paid order of a credit pack, so a
 * subscription's orders are ignored.
 *
 * The user is the one the checkout was made for (its metadata), or the
 * Polar customer's external id, which is the user's id.
 */
export const readCreditOrder = (
  eventType: string,
  order: PolarOrder | null | undefined,
  packs: CreditPack[]
): { orderId: string; userId: string; pack: CreditPack } | null => {
  if (eventType !== "order.paid" || !order || order.paid === false) return null;

  const orderId = text(order.id);
  const productId = text(order.product_id) ?? text(order.productId) ?? text(order.product?.id);
  const pack = packs.find((entry) => entry.productId === productId);
  const userId =
    text(order.metadata?.userId) ??
    text(order.customer?.external_id) ??
    text(order.customer?.externalId);

  return orderId && pack && userId ? { orderId, userId, pack } : null;
};
