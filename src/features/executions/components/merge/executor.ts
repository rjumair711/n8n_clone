import { NodeExecutor } from "../../types";

type MergeData = {
  mode?: "any" | "all";
  variableName?: string;
};

// Branches share one context, so merging data is implicit. The node is the
// join point: in "all" mode the engine only reaches it once every connected
// branch has run.
export const mergeExecutor: NodeExecutor<MergeData> = async ({
  data,
  context,
  inputs,
}) => {
  const variableName = data.variableName?.trim() || "merge";

  return {
    ...context,
    [variableName]: {
      mode: data.mode || "any",
      branchesReceived: inputs?.active ?? 0,
      branchesConnected: inputs?.total ?? 0,
    },
  };
};
