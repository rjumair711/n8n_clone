import type { NodeExecutor } from "@/features/executions/types";
import { NonRetriableError } from "inngest";

type ScheduleData = {
  variableName?: string;
  cronExpression?: string;
};

export const ScheduleExecutor: NodeExecutor<
  ScheduleData
> = async ({
  data,
  context,
}) => {

  // Validation
  if (!data.variableName) {
    throw new NonRetriableError(
      "Schedule node: Variable name is missing"
    );
  }

  if (!data.cronExpression) {
    throw new NonRetriableError(
      "Schedule node: Cron expression is required"
    );
  }

  // Basic layout layout check (UNIX cron requirements)
  const parts = data.cronExpression.trim().split(/\s+/);
  if (parts.length < 5 || parts.length > 6) {
    throw new NonRetriableError(
      "Schedule node: Invalid cron expression format. Expected 5 or 6 space-separated fields."
    );
  }

  try {
    const now = new Date();
    
    return {
      ...context,
      [data.variableName]: {
        timestamp: now.toISOString(),
        date: now.toLocaleDateString(),
        time: now.toLocaleTimeString(),
        cron: data.cronExpression,
      },
    };

  } catch (error: any) {
    throw new NonRetriableError(
      `Schedule node execution failed: ${error.message}`
    );
  }
};