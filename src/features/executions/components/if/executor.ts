import { NodeExecutor } from "../../types";
import { renderTemplate } from "@/features/executions/lib/templates";
import { NonRetriableError } from "inngest";
import Handlebars from "handlebars";
import { evaluateCondition, getValueByPath } from "../../lib/conditions";

type IfCondition = {
  inputKey: string;
  operator: string;
  value?: string;
};

type IfData = {
  conditions?: IfCondition[];
  combinator?: "and" | "or";
};

export const ifExecutor: NodeExecutor<IfData> = async ({
  data,
  context,
}) => {
  const { conditions = [], combinator = "and" } = data;

  if (conditions.length === 0) {
    throw new NonRetriableError("IF node requires at least one condition");
  }

  const results = conditions.map((condition) => {
    const { inputKey, operator, value } = condition;

    if (!inputKey || !operator) {
      throw new NonRetriableError(
        "IF node: every condition needs an input key and an operator"
      );
    }

    const actualValue = getValueByPath(context, inputKey);

    // The comparison value may reference other variables: {{order.minimum}}
    const expectedValue =
      value && value.includes("{{")
        ? renderTemplate(value, context)
        : value;

    const passed = evaluateCondition(actualValue, operator, expectedValue);

    if (passed === null) {
      throw new NonRetriableError(`Unsupported IF operator: ${operator}`);
    }

    return { inputKey, operator, expectedValue, actualValue, passed };
  });

  const result =
    combinator === "or"
      ? results.some((entry) => entry.passed)
      : results.every((entry) => entry.passed);

  // The engine follows the "true" or the "false" output based on ifResult
  return {
    ...context,
    ifResult: result,
    if: {
      result,
      combinator,
      conditions: results,
    },
  };
};
