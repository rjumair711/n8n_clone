export enum SubscriptionPlan {
  FREE = "FREE",
  BEGINNER = "BEGINNER",
  INTERMEDIATE = "INTERMEDIATE",
  PRO = "PRO",
}

export const PLAN_LIMITS = {
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
    },
  },
} as const;

export type PlanFeature = keyof typeof PLAN_LIMITS.PRO.features;

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
};

// Not unlocked by the free trial. SSH opens connections from this server to
// hosts users choose; it stays with paying, identifiable accounts.
const TRIAL_EXCLUDED_FEATURES = new Set<PlanFeature>(["ssh"]);

const PLAN_ORDER = ["FREE", "BEGINNER", "INTERMEDIATE", "PRO"] as const;

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