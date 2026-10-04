import { NodeExecutor } from "../../types";
import { NonRetriableError } from "inngest";
import { evaluateCondition, getValueByPath } from "../../lib/conditions";

type SwitchRule = {
  id: string;
  label: string;
  inputKey: string;
  operator: string;
  value?: string;
};

type SwitchData = {
  rules?: SwitchRule[];
  fallbackBranch?: boolean;
};

export const switchExecutor: NodeExecutor<SwitchData> = async ({
  data,
  context,
}) => {
  const { rules = [], fallbackBranch = true } = data;

  if (!rules || rules.length === 0) {
    throw new NonRetriableError("Switch node requires at least one rule");
  }

  let selectedBranchId: string | null = null;
  let matchedRuleInfo: Record<string, unknown> | null = null;

  // Evaluate rules in defined sequential order
  for (const rule of rules) {
    const { inputKey, operator, value: expectedValue, id: ruleId } = rule;

    if (!inputKey || !operator) {
      continue;
    }

    const actualValue = getValueByPath(context, inputKey);
    const passed = evaluateCondition(actualValue, operator, expectedValue);

    if (passed === null) {
      throw new NonRetriableError(
        `Unsupported switch operator: ${operator}`
      );
    }

    if (passed) {
      selectedBranchId = ruleId;
      matchedRuleInfo = {
        ruleId,
        inputKey,
        operator,
        expectedValue,
        actualValue,
      };
      break; // Stop evaluation at first matching branch rule
    }
  }

  // Fallback routing if no rule matches
  if (!selectedBranchId && fallbackBranch) {
    selectedBranchId = "default";
  }

  // The engine follows only the connections leaving the matched branch handle
  return {
    ...context,
    matchedBranch: selectedBranchId,
    switch: {
      matchedBranch: selectedBranchId,
      matchedRule: matchedRuleInfo,
    },
  };
};
