import { NodeExecutor } from "../../types";
import { NonRetriableError } from "inngest";
import { filterChannel } from "@/inngest/channels/filter"; // Import the channel

type FilterData = {
  inputKey?: string;
  operator?: string;
  value?: string;
};

const getValueByPath = (
  object: Record<string, unknown>,
  path: string
): unknown => {
  return path.split(".").reduce<unknown>((current, key) => {
    if (
      current !== null &&
      typeof current === "object" &&
      key in current
    ) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, object);
};

export const filterExecutor: NodeExecutor<FilterData> = async ({
  data,
  nodeId,
  context,
  publish
}) => {
  const { inputKey, operator, value: expectedValue } = data;

  // Publish loading status
  await publish(
    filterChannel().status({
      nodeId: nodeId,
      status: "loading",
      message: "Processing filter condition..."
    })
  );

  if (!inputKey || !operator) {
    await publish(
      filterChannel().status({
        nodeId: nodeId,
        status: "error",
        message: "Missing inputKey or operator"
      })
    );
    throw new NonRetriableError("Filter node requires inputKey and operator");
  }

  const actualValue = getValueByPath(context, inputKey);
  let passed = false;

  switch (operator) {
    case "equals":
      passed = String(actualValue) === String(expectedValue);
      break;

    case "not_equals":
      passed = String(actualValue) !== String(expectedValue);
      break;

    case "contains":
      passed = String(actualValue).includes(String(expectedValue));
      break;

    case "greater_than":
      passed = Number(actualValue) > Number(expectedValue);
      break;

    case "less_than":
      passed = Number(actualValue) < Number(expectedValue);
      break;

    case "exists":
      passed =
        actualValue !== undefined &&
        actualValue !== null &&
        actualValue !== "";
      break;

    default:
      await publish(
        filterChannel().status({
          nodeId: nodeId,
          status: "error",
          message: `Unsupported operator: ${operator}`
        })
      );
      throw new NonRetriableError(`Unsupported filter operator: ${operator}`);
  }

  // Update context with filter result
  await publish(
    filterChannel().status({
      nodeId: nodeId,
      status: "success",
      message: passed ? "Filter condition passed" : "Filter condition failed"
    })
  );

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