import { NonRetriableError } from "inngest";
import { NodeExecutor } from "../../types";
import { combineLists, type MergeCombineMode } from "../../lib/list-ops";
import { readInputList } from "../data/executors";

type MergeData = {
  mode?: "any" | "all";
  variableName?: string;
  // Optionally combine two lists, like n8n's Append / Combine modes
  combine?: MergeCombineMode;
  listA?: string;
  listB?: string;
  keyA?: string;
  keyB?: string;
};

// Branches share one context, so variables set on any branch that ran stay
// available. The node is the join point: in "all" mode the engine only
// reaches it once every connected branch has run. It can also combine two
// lists from those branches into one.
export const mergeExecutor: NodeExecutor<MergeData> = async ({
  data,
  context,
  inputs,
  items: incomingItems,
}) => {
  const variableName = data.variableName?.trim() || "merge";
  const combine = data.combine || "none";

  const result: Record<string, unknown> = {
    mode: data.mode || "any",
    branchesReceived: inputs?.active ?? 0,
    branchesConnected: inputs?.total ?? 0,
  };

  if (combine !== "none") {
    if (combine === "byKey" && !data.keyA?.trim()) {
      throw new NonRetriableError(
        "Merge node: Field To Match is required to combine by matching field"
      );
    }

    // "Append" without named lists joins the items of the connected
    // branches, which the engine has already put together
    const items =
      combine === "append" &&
      !data.listA?.trim() &&
      !data.listB?.trim() &&
      incomingItems
        ? incomingItems
        : combineLists(
            readInputList("Merge", context, data.listA),
            readInputList("Merge", context, data.listB),
            combine,
            data.keyA?.trim(),
            data.keyB?.trim()
          );

    result.items = items;
    result.count = items.length;
  }

  return {
    ...context,
    [variableName]: result,
  };
};
