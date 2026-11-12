import { SELF_HOSTED } from "./self-hosted";

// RXJ has no plans any more: Beginner, Intermediate and Pro are not sold,
// and what is on sale is the managed private server (pricing-plans.ts).
// Every account gets the same: every node, template and feature, with one
// set of limits that protect the hosted app's costs (runs a month here; the
// daily message caps in message-caps.ts; the monthly RXJ AI credits in
// ai-credits.ts). A self-hosted server has no limits at all.
//
// The plan column in the database, the SubscriptionPlan names and the
// functions below stay, so older rows and callers keep working: every plan
// name now means the same limits.

export enum SubscriptionPlan {
  FREE = "FREE",
  BEGINNER = "BEGINNER",
  INTERMEDIATE = "INTERMEDIATE",
  PRO = "PRO",
}

const FEATURES = [
  "aiNodes",
  "webhooks",
  "discord",
  "slack",
  "gmail",
  "googleSheets",
  "scheduling",
  "whatsapp",
  "aiAgents",
  "apiAccess",
  "ssh",
  // The Browser node: a real browser opens pages users choose
  "browser",
  // Enterprise: SSO, Git sync and external secrets
  "enterprise",
] as const;

export type PlanFeature = (typeof FEATURES)[number];

export type PlanLimits = {
  monthlyExecutions: number;
  activeWorkflows: number;
  executionHistoryDays: number;
  credentials: number;
  features: Record<PlanFeature, boolean>;
};

// Workflow runs one account may start per calendar month (UTC) on the
// hosted app. Each run is paid for in Inngest, Vercel and database time.
export const HOSTED_MONTHLY_EXECUTIONS = 2000;

// Features only a server whose owner is known may offer. SSH opens
// connections from the server to hosts users choose: on the hosted app,
// anyone who signs up could use its address against other people's servers.
const OWN_SERVER_FEATURES = new Set<PlanFeature>(["ssh"]);

const allFeatures = (except: Set<PlanFeature> = new Set()) =>
  Object.fromEntries(FEATURES.map((feature) => [feature, !except.has(feature)])) as Record<
    PlanFeature,
    boolean
  >;

// The hosted app: every account, whatever its plan column says
const HOSTED_LIMITS: PlanLimits = {
  monthlyExecutions: HOSTED_MONTHLY_EXECUTIONS,
  activeWorkflows: Infinity,
  executionHistoryDays: 30,
  credentials: Infinity,
  features: allFeatures(OWN_SERVER_FEATURES),
};

// A self-hosted or managed server: no limits, every feature
const UNLIMITED: PlanLimits = {
  monthlyExecutions: Infinity,
  activeWorkflows: Infinity,
  executionHistoryDays: Infinity,
  credentials: Infinity,
  features: allFeatures(),
};

export type PlanName = keyof typeof SubscriptionPlan;

// Kept for the code that still names plans (template rows, Polar)
export const PLAN_ORDER = ["FREE", "BEGINNER", "INTERMEDIATE", "PRO"] as const;

/** The limits of every plan name: all the same, for the hosted app or a self-hosted server. */
export const buildPlanLimits = (selfHosted: boolean): Record<PlanName, PlanLimits> => {
  const limits = selfHosted ? UNLIMITED : HOSTED_LIMITS;
  return { FREE: limits, BEGINNER: limits, INTERMEDIATE: limits, PRO: limits };
};

export const PLAN_LIMITS = buildPlanLimits(SELF_HOSTED);

/**
 * The plan a Polar product is, or null for a product that is not a plan
 * (the managed private server, an AI credit pack). The plans are not sold
 * any more; earlier subscriptions still send their events.
 */
export const getPlanForPolarProduct = (
  productId: string | null | undefined,
  env: Record<string, string | undefined> = process.env
): "BEGINNER" | "INTERMEDIATE" | "PRO" | null => {
  if (!productId) return null;

  if (productId === env.POLAR_BEGINNER_PRODUCT_ID) return "BEGINNER";
  if (productId === env.POLAR_INTERMEDIATE_PRODUCT_ID) return "INTERMEDIATE";
  if (productId === env.POLAR_PRO_PRODUCT_ID) return "PRO";

  return null;
};

// Nodes that need a feature. Node types that are not listed need none.
export const NODE_PLAN_FEATURES: Record<string, PlanFeature> = {
  SCHEDULE_TRIGGER: "scheduling",
  GOOGLE_SHEETS: "googleSheets",
  AI_AGENT: "aiAgents",
  WHATSAPP: "whatsapp",
  WHATSAPP_TRIGGER: "whatsapp",
  GMAIL: "gmail",
  GMAIL_TRIGGER: "gmail",
  SSH: "ssh",
  BROWSER: "browser",
};

// What getRequiredPlanForNode returns for a node this server does not offer
export const OWN_SERVER_REQUIRED = "self-hosted";

export const OWN_SERVER_MESSAGE =
  "is only available on a self-hosted or managed RXJ server (see Pricing)";

/** "SSH is only available on a self-hosted or managed RXJ server (see Pricing)" */
export const unavailableMessage = (what: string) => `${what} ${OWN_SERVER_MESSAGE}`;

/** Whether this server offers the node. */
export const isNodeAvailable = (nodeType: string) => {
  const feature = NODE_PLAN_FEATURES[nodeType];
  return !feature || PLAN_LIMITS.FREE.features[feature];
};

/**
 * Kept for the code that sorts template rows by plan: FREE when this server
 * offers every one of the nodes, PRO when it does not.
 */
export const getMinPlanForNodes = (nodeTypes: Iterable<string>): PlanName => {
  for (const type of nodeTypes) {
    if (!isNodeAvailable(type)) return "PRO";
  }
  return "FREE";
};

/**
 * null when the node may be used, which is every node except the ones only a
 * self-hosted server offers: then OWN_SERVER_REQUIRED. The plan and trial
 * arguments no longer change anything; they stay for the callers.
 */
export const getRequiredPlanForNode = (
  nodeType: string,
  _plan?: string,
  _trialEndsAt?: Date | string | null
): string | null => (isNodeAvailable(nodeType) ? null : OWN_SERVER_REQUIRED);

/** The same for a feature that is not a node (Git sync, external secrets, SSO). */
export const getRequiredPlanForFeature = (
  feature: PlanFeature,
  _plan?: string,
  _trialEndsAt?: Date | string | null
): string | null => (PLAN_LIMITS.FREE.features[feature] ? null : OWN_SERVER_REQUIRED);

/** The message when an account has used its runs for the month. */
export const monthlyRunLimitMessage = (limit: number) =>
  `Monthly run limit reached: an account may start ${limit.toLocaleString("en-US")} workflow runs a month on this server. The count starts again on the 1st (UTC). A self-hosted or managed RXJ server has no limit.`;
