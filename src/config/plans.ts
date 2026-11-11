import { SELF_HOSTED } from "./self-hosted";

export enum SubscriptionPlan {
  FREE = "FREE",
  BEGINNER = "BEGINNER",
  INTERMEDIATE = "INTERMEDIATE",
  PRO = "PRO",
}

// What the paid plans of the hosted app include
const PAID_PLAN_LIMITS = {
  FREE: {
    monthlyExecutions: 500,
    activeWorkflows: 3,
    executionHistoryDays: 1,
    credentials: 2,

    features: {
      aiNodes: true,
      webhooks: true,
      discord: true,
      slack: true,

      gmail: false,
      googleSheets: false,
      scheduling: false,

      whatsapp: false,
      aiAgents: false,
      apiAccess: false,
      ssh: false,
      // The Browser node: a real browser opens pages users choose
      browser: false,
      // Enterprise: SSO, Git sync and external secrets
      enterprise: false,
    },
  },

  BEGINNER: {
    monthlyExecutions: 1000,
    activeWorkflows: 5,
    executionHistoryDays: 7,
    credentials: 5,

    features: {
      aiNodes: true,
      webhooks: true,
      discord: true,
      slack: true,

      gmail: false,
      googleSheets: false,
      scheduling: false,

      whatsapp: false,
      aiAgents: false,
      apiAccess: false,
      ssh: false,
      // The Browser node: a real browser opens pages users choose
      browser: false,
      // Enterprise: SSO, Git sync and external secrets
      enterprise: false,
    },
  },

  INTERMEDIATE: {
    monthlyExecutions: 15000,
    activeWorkflows: 20,
    executionHistoryDays: 30,
    credentials: 20,

    features: {
      aiNodes: true,
      webhooks: true,
      discord: true,
      slack: true,

      gmail: true,
      googleSheets: true,
      scheduling: true,

      whatsapp: false,
      aiAgents: true,
      apiAccess: false,
      ssh: false,
      // The Browser node: a real browser opens pages users choose
      browser: false,
      // Enterprise: SSO, Git sync and external secrets
      enterprise: false,
    },
  },

  PRO: {
    monthlyExecutions: 100000,
    activeWorkflows: Infinity,
    executionHistoryDays: 365,
    credentials: Infinity,

    features: {
      aiNodes: true,
      webhooks: true,
      discord: true,
      slack: true,

      gmail: true,
      googleSheets: true,
      scheduling: true,

      whatsapp: true,
      aiAgents: true,
      apiAccess: true,
      ssh: true,
      // The Browser node: a real browser opens pages users choose
      browser: true,
      // Enterprise: SSO, Git sync and external secrets
      enterprise: true,
    },
  },
} as const;

export type PlanFeature = keyof typeof PAID_PLAN_LIMITS.PRO.features;

export type PlanLimits = {
  monthlyExecutions: number;
  activeWorkflows: number;
  executionHistoryDays: number;
  credentials: number;
  features: Record<PlanFeature, boolean>;
};

// Self-hosted: no limits, every feature, whatever plan a user row says
const UNLIMITED: PlanLimits = {
  monthlyExecutions: Infinity,
  activeWorkflows: Infinity,
  executionHistoryDays: Infinity,
  credentials: Infinity,
  features: Object.fromEntries(
    Object.keys(PAID_PLAN_LIMITS.PRO.features).map((feature) => [feature, true])
  ) as Record<PlanFeature, boolean>,
};

/** The limits of every plan, for the hosted app or a self-hosted server. */
export const buildPlanLimits = (
  selfHosted: boolean
): Record<keyof typeof PAID_PLAN_LIMITS, PlanLimits> =>
  selfHosted
    ? { FREE: UNLIMITED, BEGINNER: UNLIMITED, INTERMEDIATE: UNLIMITED, PRO: UNLIMITED }
    : PAID_PLAN_LIMITS;

export const PLAN_LIMITS = buildPlanLimits(SELF_HOSTED);

/**
 * The plan a Polar product is, or null for a product that is not a plan
 * (the managed private server, an AI credit pack). Only plan products may
 * change a user's plan.
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

// Nodes that are only available on plans with the given feature. Node types
// that are not listed are available on every plan.
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

// Not unlocked by the free trial. SSH opens connections from this server to
// hosts users choose; it stays with paying, identifiable accounts.
// The enterprise features connect a workspace to systems of a company (its
// identity provider, its repository, its vault); they are for the plan that
// includes them.
const TRIAL_EXCLUDED_FEATURES = new Set<PlanFeature>(["ssh", "enterprise"]);

export type PlanName = keyof typeof PLAN_LIMITS;

// Cheapest first
export const PLAN_ORDER = ["FREE", "BEGINNER", "INTERMEDIATE", "PRO"] as const;

/**
 * The cheapest plan that can run every one of these node types. A template
 * is shown with this plan, and a user on a cheaper plan cannot use it.
 */
export const getMinPlanForNodes = (nodeTypes: Iterable<string>): PlanName => {
  let index = 0;

  for (const type of nodeTypes) {
    const feature = NODE_PLAN_FEATURES[type];
    if (!feature) continue;

    const unlockedAt = PLAN_ORDER.findIndex((name) => PLAN_LIMITS[name].features[feature]);
    index = Math.max(index, unlockedAt === -1 ? PLAN_ORDER.length - 1 : unlockedAt);
  }

  return PLAN_ORDER[index];
};

/**
 * Whether an active free trial unlocks every one of these node types. It
 * does not unlock SSH, the same as for a single node.
 */
export const trialUnlocksNodes = (nodeTypes: Iterable<string>) => {
  for (const type of nodeTypes) {
    const feature = NODE_PLAN_FEATURES[type];
    if (feature && TRIAL_EXCLUDED_FEATURES.has(feature)) return false;
  }

  return true;
};

const PLAN_LABELS: Record<keyof typeof PLAN_LIMITS, string> = {
  FREE: "Free",
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  PRO: "Pro",
};

/**
 * Returns the name of the cheapest plan that unlocks the node, or null when
 * the user may use it. An active free trial unlocks every node, so new users
 * can try the whole product; execution and workflow limits still apply.
 */
export const getRequiredPlanForNode = (
  nodeType: string,
  plan: keyof typeof PLAN_LIMITS,
  trialEndsAt?: Date | string | null
): string | null => {
  const feature = NODE_PLAN_FEATURES[nodeType];
  if (!feature) return null;

  if (PLAN_LIMITS[plan]?.features[feature]) return null;

  if (
    !TRIAL_EXCLUDED_FEATURES.has(feature) &&
    trialEndsAt &&
    new Date(trialEndsAt) > new Date()
  ) {
    return null;
  }

  const required = PLAN_ORDER.find((name) => PLAN_LIMITS[name].features[feature]);

  return PLAN_LABELS[required ?? "PRO"];
};

/**
 * The same question for a feature that is not a node (Git sync, external
 * secrets, SSO): the plan that unlocks it, or null when the plan has it.
 */
export const getRequiredPlanForFeature = (
  feature: PlanFeature,
  plan: keyof typeof PLAN_LIMITS,
  trialEndsAt?: Date | string | null
): string | null => {
  if (PLAN_LIMITS[plan]?.features[feature]) return null;

  if (
    !TRIAL_EXCLUDED_FEATURES.has(feature) &&
    trialEndsAt &&
    new Date(trialEndsAt) > new Date()
  ) {
    return null;
  }

  const required = PLAN_ORDER.find((name) => PLAN_LIMITS[name].features[feature]);

  return PLAN_LABELS[required ?? "PRO"];
};
