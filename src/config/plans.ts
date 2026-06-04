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
      browserAutomation: false,
      apiAccess: false,
      teamWorkspace: false,
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
      browserAutomation: false,
      apiAccess: false,
      teamWorkspace: false,
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
      browserAutomation: false,
      apiAccess: false,
      teamWorkspace: false,
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
      browserAutomation: true,
      apiAccess: true,
      teamWorkspace: true,
    },
  },
} as const;