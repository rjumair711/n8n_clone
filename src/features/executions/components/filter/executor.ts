import { NodeExecutor } from "../../types";
import { NonRetriableError } from "inngest";
import { evaluateCondition, getValueByPath } from "../../lib/conditions";

type FilterData = {
  inputKey?: string;
  operator?: string;
  value?: string;
};

export const filterExecutor: NodeExecutor<
  FilterData
> = async ({
  data,
  context,
}) => {

  const {
    inputKey,
    operator,
    value: expectedValue,
  } = data;

  // Validation
  if (!inputKey || !operator) {
    throw new NonRetriableError(
      "Filter node requires inputKey and operator"
    );
  }

  const actualValue = getValueByPath(
    context,
    inputKey
  );

  const passed = evaluateCondition(
    actualValue,
    operator,
    expectedValue
  );

  if (passed === null) {
    throw new NonRetriableError(
      `Unsupported filter operator: ${operator}`
    );
  }

  return {
    ...context,
    filterPassed: passed,
    filter: {
      inputKey,
      operator,
      expectedValue,
      actualValue,
      passed,
    },
  };
};
