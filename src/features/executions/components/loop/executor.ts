import { NodeExecutor } from "../../types";
import { NonRetriableError } from "inngest";
import { getValueByPath } from "../../lib/conditions";
import {
  LOOP_DEFAULT_MAX_ITERATIONS,
  LOOP_HARD_MAX_ITERATIONS,
} from "@/inngest/engine";

type LoopData = {
  itemsPath?: string;
  variableName?: string;
  maxIterations?: number;
};

// Resolves the list to iterate. The engine then runs everything connected to
// the "loop" output once per item, exposing {{loop.item}} and {{loop.index}}.
export const loopExecutor: NodeExecutor<LoopData> = async ({
  data,
  context,
  items: incomingItems,
}) => {
  const itemsPath = data.itemsPath?.trim();

  if (!itemsPath && !incomingItems) {
    throw new NonRetriableError(
      "Loop node requires the path to a list, or a list node connected before it"
    );
  }

  const variableName = data.variableName?.trim() || "loop";
  // Without a path the loop runs over the items a list node sent here
  const value = itemsPath ? getValueByPath(context, itemsPath) : incomingItems;

  if (!Array.isArray(value)) {
    throw new NonRetriableError(
      `Loop node: "${itemsPath}" is not a list`
    );
  }

  // Every iteration costs Inngest steps, and a run is capped at 1000 of them
  const maxIterations = Math.min(
    Number(data.maxIterations) || LOOP_DEFAULT_MAX_ITERATIONS,
    LOOP_HARD_MAX_ITERATIONS
  );

  if (value.length > maxIterations) {
    throw new NonRetriableError(
      `Loop node: the list has ${value.length} items but the limit is ${maxIterations}`
    );
  }

  return {
    ...context,
    [variableName]: {
      items: value,
      total: value.length,
    },
  };
};
