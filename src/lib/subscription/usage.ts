import { PLAN_LIMITS } from "@/config/plans";

export const getWorkflowLimit = (
  plan: keyof typeof PLAN_LIMITS
) => {
  return PLAN_LIMITS[plan].activeWorkflows;
};

export const getExecutionLimit = (
  plan: keyof typeof PLAN_LIMITS
) => {
  return PLAN_LIMITS[plan].monthlyExecutions;
};

export const hasReachedWorkflowLimit = ({
  currentCount,
  plan,
}: {
  currentCount: number;
  plan: keyof typeof PLAN_LIMITS;
}) => {
  return (
    currentCount >=
    PLAN_LIMITS[plan].activeWorkflows
  );
};

export const hasReachedExecutionLimit = ({
  executionsUsed,
  plan,
}: {
  executionsUsed: number;
  plan: keyof typeof PLAN_LIMITS;
}) => {
  return (
    executionsUsed >=
    PLAN_LIMITS[plan].monthlyExecutions
  );
};