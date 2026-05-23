import { NodeExecutor } from "../../types";
import { NonRetriableError } from "inngest";

type FilterData = {
  inputKey?: string;
  operator?: string;
  value?: string;
};

const getValueByPath = (
  object: Record<string, unknown>,
  path: string
): unknown => {
  return path.split(".").reduce<unknown>(
    (current, key) => {
      if (
        current !== null &&
        typeof current === "object" &&
        key in current
      ) {
        return (current as Record<string, unknown>)[key];
      }

      return undefined;
    },
    object
  );
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

  let passed = false;

  switch (operator) {

    case "equals":
      passed =
        String(actualValue) ===
        String(expectedValue);
      break;

    case "not_equals":
      passed =
        String(actualValue) !==
        String(expectedValue);
      break;

    case "contains":
      passed = String(actualValue).includes(
        String(expectedValue)
      );
      break;

    case "greater_than":
      passed =
        Number(actualValue) >
        Number(expectedValue);
      break;

    case "less_than":
      passed =
        Number(actualValue) <
        Number(expectedValue);
      break;

    case "exists":
      passed =
        actualValue !== undefined &&
        actualValue !== null &&
        actualValue !== "";
      break;

    default:
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