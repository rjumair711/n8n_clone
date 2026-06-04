import { PLAN_LIMITS } from "@/config/plans";
import { SubscriptionPlan } from "@prisma/client";


export const getPlanLimits = (plan: SubscriptionPlan) => {
  return PLAN_LIMITS[plan];
};

export const hasFeatureAccess = (
  plan: SubscriptionPlan,
  feature: keyof typeof PLAN_LIMITS.PRO.features
) => {
  return PLAN_LIMITS[plan].features[feature];
};

export const canCreateWorkflow = (
  plan: SubscriptionPlan,
  currentWorkflowCount: number
) => {
  return currentWorkflowCount <
    PLAN_LIMITS[plan].activeWorkflows;
};

export const canRunExecutions = (
  plan: SubscriptionPlan,
  executionsUsed: number
) => {
  return executionsUsed <
    PLAN_LIMITS[plan].monthlyExecutions;
};