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
}) => {
  if (!data.itemsPath) {
    throw new NonRetriableError("Loop node requires the path to a list");
  }

  const variableName = data.variableName?.trim() || "loop";
  const value = getValueByPath(context, data.itemsPath);

  if (!Array.isArray(value)) {
    throw new NonRetriableError(
      `Loop node: "${data.itemsPath}" is not a list`
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
