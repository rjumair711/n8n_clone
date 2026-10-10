// Token usage, prices and budgets for model calls. No server imports: the
// pages use the formatting, and the rules are pure functions so they can be
// tested without a database. The database side is src/lib/ai-usage.ts.

// Node types that call a language or embedding model themselves. A model
// node plugged into an AI Agent's Chat Model port does not run: the agent
// makes the call.
export const AI_NODE_TYPES: ReadonlySet<string> = new Set([
  "AI_AGENT",
  "OPENAI",
  "ANTHROPIC",
  "GEMINI",
  "CHAT_MODEL",
  "DEEPSEEK",
  "KIMI",
  "QWEN",
  "TEXT_CLASSIFIER",
  "INFORMATION_EXTRACTOR",
  "VECTOR_STORE",
]);

export type TokenUsage = {
  // Input tokens that were not read from the provider's cache
  inputTokens: number;
  outputTokens: number;
  // Input tokens read from the provider's cache
  cachedInputTokens: number;
};

// What the AI SDK reports for a call (LanguageModelUsage), or what an
// executor kept of it in a step result
type ReportedUsage = {
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
  inputTokenDetails?: {
    noCacheTokens?: number | null;
    cacheReadTokens?: number | null;
    cacheWriteTokens?: number | null;
  } | null;
} | null | undefined;

const toCount = (value: unknown) => {
  const number = Number(value);

  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
};

/**
 * The three numbers that are stored and priced. The SDK's `inputTokens` is
 * the whole prompt, cached part included, so the cached tokens are taken
 * out of it. Tokens written to a cache count as normal input.
 */
export const normalizeUsage = (usage: ReportedUsage): TokenUsage => {
  const details = usage?.inputTokenDetails;
  const cachedInputTokens = toCount(details?.cacheReadTokens ?? usage?.cachedInputTokens);

  const inputTokens =
    usage?.inputTokens === undefined || usage?.inputTokens === null
      ? toCount(details?.noCacheTokens) + toCount(details?.cacheWriteTokens)
      : Math.max(toCount(usage.inputTokens) - cachedInputTokens, 0);

  return {
    inputTokens,
    outputTokens: toCount(usage?.outputTokens),
    cachedInputTokens,
  };
};

// An embedding call only has input
export const embeddingUsage = (usage: { tokens?: number | null } | null | undefined): TokenUsage => ({
  inputTokens: toCount(usage?.tokens),
  outputTokens: 0,
  cachedInputTokens: 0,
});

// US dollars per million tokens
export type ModelPriceRates = {
  inputPerM: number;
  outputPerM: number;
  // Null: cached input is charged like other input
  cachedInputPerM: number | null;
};

// Provider and model are compared in lower case, without surrounding spaces
export const normalizePriceKey = (value: string | null | undefined) =>
  (value ?? "").trim().toLowerCase();

const COST_DECIMALS = 10;

export const roundCost = (value: number) =>
  Number.isFinite(value) ? Number(value.toFixed(COST_DECIMALS)) : 0;

/**
 * What a call cost in US dollars, or null when there is no price for its
 * model: an unknown price is not the same as free.
 */
export const computeCostUsd = (
  usage: TokenUsage,
  price: ModelPriceRates | null | undefined
): number | null => {
  if (!price) return null;

  const cachedRate = price.cachedInputPerM ?? price.inputPerM;

  return roundCost(
    (usage.inputTokens * price.inputPerM +
      usage.outputTokens * price.outputPerM +
      usage.cachedInputTokens * cachedRate) /
      1_000_000
  );
};

// Budgets and the month's spend follow the calendar month in UTC
export const startOfUtcMonth = (date: Date = new Date()) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

export const centsToUsd = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? null : cents / 100;

export const MAX_BUDGET_USD = 100_000;

/**
 * A budget typed in dollars, as whole cents. Null (no budget) for an empty
 * value; undefined when it is not an amount between 1 cent and the maximum.
 */
export const parseBudgetCents = (
  value: string | number | null | undefined
): number | null | undefined => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;

  const amount = typeof value === "number" ? value : Number(value.trim());
  if (!Number.isFinite(amount)) return undefined;

  const cents = Math.round(amount * 100);

  return cents >= 1 && cents <= MAX_BUDGET_USD * 100 ? cents : undefined;
};

// A budget is used up once the month's spend reaches it
export const isBudgetUsedUp = (spentUsd: number, budgetCents: number | null | undefined) =>
  budgetCents !== null && budgetCents !== undefined && spentUsd >= budgetCents / 100;

/**
 * "$12.34", or more decimals for amounts under a cent, which is what one
 * call usually costs.
 */
export const formatUsd = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  if (value === 0) return "$0.00";
  if (Math.abs(value) >= 1) return `$${value.toFixed(2)}`;
  if (Math.abs(value) >= 0.01) return `$${value.toFixed(4).replace(/0{1,2}$/, "")}`;
  if (Math.abs(value) < 0.000001) return "<$0.000001";

  return `$${value.toFixed(6).replace(/0+$/, "")}`;
};

export const formatTokens = (value: number | null | undefined) =>
  (value ?? 0).toLocaleString("en-US");

export const aiBudgetError = ({
  scope,
  workflowName,
  spentUsd,
  budgetCents,
}: {
  scope: "workflow" | "account";
  workflowName?: string | null;
  spentUsd: number;
  budgetCents: number;
}) => {
  const budget = formatUsd(budgetCents / 100);
  const spent = formatUsd(spentUsd);

  return scope === "workflow"
    ? `Monthly AI budget reached: the workflow${workflowName ? ` "${workflowName}"` : ""} has spent ${spent} on AI this month and its budget is ${budget}. Raise or remove the budget in the workflow's settings, or wait until the 1st of next month (UTC).`
    : `Monthly AI budget reached: your account has spent ${spent} on AI this month and your budget is ${budget}. Raise or remove the budget on the Billing page, or wait until the 1st of next month (UTC).`;
};

export type UsageRow = TokenUsage & {
  nodeId: string | null;
  nodeName: string | null;
  provider: string;
  model: string;
  costUsd: number | null;
};

export type UsageGroup = TokenUsage & {
  nodeId: string | null;
  nodeName: string | null;
  provider: string;
  model: string;
  calls: number;
  // The priced calls only
  costUsd: number;
  // Calls whose model had no price when they were made
  unpricedCalls: number;
};

export const sumUsage = (rows: (TokenUsage & { costUsd: number | null })[]) => {
  const total = {
    calls: rows.length,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    costUsd: 0,
    unpricedCalls: 0,
  };

  for (const row of rows) {
    total.inputTokens += row.inputTokens;
    total.outputTokens += row.outputTokens;
    total.cachedInputTokens += row.cachedInputTokens;

    if (row.costUsd === null) total.unpricedCalls++;
    else total.costUsd += row.costUsd;
  }

  total.costUsd = roundCost(total.costUsd);

  return total;
};

/**
 * An execution's calls, one line per node and model, in the order the nodes
 * first called a model, with the total of the run.
 */
export const summarizeExecutionUsage = (rows: UsageRow[]) => {
  const groups = new Map<string, { head: UsageRow; rows: UsageRow[] }>();

  for (const row of rows) {
    const key = JSON.stringify([row.nodeId, row.provider, row.model]);
    const group = groups.get(key);

    if (group) group.rows.push(row);
    else groups.set(key, { head: row, rows: [row] });
  }

  const nodes: UsageGroup[] = [...groups.values()].map(({ head, rows: groupRows }) => ({
    nodeId: head.nodeId,
    nodeName: head.nodeName,
    provider: head.provider,
    model: head.model,
    ...sumUsage(groupRows),
  }));

  return { nodes, total: sumUsage(rows) };
};
