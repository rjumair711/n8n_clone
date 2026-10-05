import type { NodeExecutor, WorkflowContext } from "@/features/executions/types";
import { NonRetriableError } from "inngest";
import { getValueByPath } from "../../lib/conditions";
import { renderTemplate } from "../../lib/templates";
import {
  SUMMARIZE_AGGREGATIONS,
  aggregate,
  limitItems,
  parseFieldList,
  removeDuplicates,
  sortItems,
  splitOut,
  summarize,
  type ListItem,
  type SummarizeAggregation,
} from "../../lib/list-ops";

type ListNodeData = {
  variableName?: string;
  // Path to the list in the workflow data, e.g. "api.httpResponse.data.items"
  inputPath?: string;
  [key: string]: string | undefined;
};

/**
 * Reads the node's input list. A single object counts as a list of one, so
 * Split Out can be pointed straight at an object that contains a list.
 */
export const readInputList = (
  label: string,
  context: WorkflowContext,
  inputPath: string | undefined,
  // The items a list node upstream sent to this node
  incomingItems?: unknown[] | null
): ListItem[] => {
  const path = (inputPath || "").trim();
  if (!path) {
    if (incomingItems) return incomingItems;

    throw new NonRetriableError(
      `${label} node: Input List is required when no list node is connected before it`
    );
  }

  const value = getValueByPath(context, path);

  if (Array.isArray(value)) return value;

  // Lists produced by these nodes are stored as { items, count }
  if (value && typeof value === "object") {
    const items = (value as { items?: unknown }).items;
    return Array.isArray(items) ? items : [value];
  }

  throw new NonRetriableError(
    `${label} node: "${path}" is not a list. Pick the variable that holds the list, for example myApiCall.httpResponse.data`
  );
};

const requireVariableName = (label: string, data: ListNodeData) => {
  const name = data.variableName?.trim();
  if (!name) {
    throw new NonRetriableError(`${label} node: Variable name is missing`);
  }
  return name;
};

const listResult = (items: ListItem[]) => ({ items, count: items.length });

export const splitOutExecutor: NodeExecutor<ListNodeData> = async ({
  data,
  context,
  items: incomingItems,
}) => {
  const variableName = requireVariableName("Split Out", data);
  const items = readInputList("Split Out", context, data.inputPath, incomingItems);

  return {
    ...context,
    [variableName]: listResult(
      splitOut(
        items,
        renderTemplate(data.field, context),
        data.include === "all"
      )
    ),
  };
};

export const aggregateExecutor: NodeExecutor<ListNodeData> = async ({
  data,
  context,
  items: incomingItems,
}) => {
  const variableName = requireVariableName("Aggregate", data);
  const items = readInputList("Aggregate", context, data.inputPath, incomingItems);
  const mode = data.operation === "all" ? "all" : "field";
  const field = renderTemplate(data.field, context);

  if (mode === "field" && !field.trim()) {
    throw new NonRetriableError("Aggregate node: Field To Aggregate is required");
  }

  return {
    ...context,
    [variableName]: aggregate(
      items,
      mode,
      field,
      renderTemplate(data.outputField, context)
    ),
  };
};

export const sortExecutor: NodeExecutor<ListNodeData> = async ({
  data,
  context,
  items: incomingItems,
}) => {
  const variableName = requireVariableName("Sort", data);
  const items = readInputList("Sort", context, data.inputPath, incomingItems);

  return {
    ...context,
    [variableName]: listResult(
      sortItems(
        items,
        renderTemplate(data.field, context),
        data.order === "desc" ? "desc" : "asc"
      )
    ),
  };
};

export const limitExecutor: NodeExecutor<ListNodeData> = async ({
  data,
  context,
  items: incomingItems,
}) => {
  const variableName = requireVariableName("Limit", data);
  const items = readInputList("Limit", context, data.inputPath, incomingItems);
  const maxItems = Number(renderTemplate(data.maxItems, context) || 1);

  if (!Number.isFinite(maxItems) || maxItems < 0) {
    throw new NonRetriableError("Limit node: Max Items must be a number");
  }

  return {
    ...context,
    [variableName]: listResult(
      limitItems(items, maxItems, data.keep === "last" ? "last" : "first")
    ),
  };
};

export const removeDuplicatesExecutor: NodeExecutor<ListNodeData> = async ({
  data,
  context,
  items: incomingItems,
}) => {
  const variableName = requireVariableName("Remove Duplicates", data);
  const items = readInputList("Remove Duplicates", context, data.inputPath, incomingItems);

  return {
    ...context,
    [variableName]: listResult(
      removeDuplicates(items, parseFieldList(renderTemplate(data.fields, context)))
    ),
  };
};

export const summarizeExecutor: NodeExecutor<ListNodeData> = async ({
  data,
  context,
  items: incomingItems,
}) => {
  const variableName = requireVariableName("Summarize", data);
  const items = readInputList("Summarize", context, data.inputPath, incomingItems);

  const aggregation = (data.operation || "count") as SummarizeAggregation;
  if (!SUMMARIZE_AGGREGATIONS.some((option) => option.value === aggregation)) {
    throw new NonRetriableError(
      `Summarize node: Unsupported aggregation "${aggregation}"`
    );
  }

  const field = renderTemplate(data.field, context);
  if (!field.trim() && aggregation !== "count") {
    throw new NonRetriableError("Summarize node: Field is required");
  }

  return {
    ...context,
    [variableName]: listResult(
      summarize(
        items,
        field,
        aggregation,
        parseFieldList(renderTemplate(data.groupBy, context))
      )
    ),
  };
};
