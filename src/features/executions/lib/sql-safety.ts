import { NonRetriableError } from "inngest";
import type { WorkflowContext } from "../types";
import { parseJsonField } from "./integration";
import { renderTemplate } from "./templates";
import {
  ALLOW_QUERY_EXPRESSIONS_LABEL,
  allowsQueryExpressions,
  hasQueryExpressions,
} from "./sql-expressions";

/**
 * The SQL text of an "Execute Query" node. Expressions in it are refused
 * unless the node's "Allow expressions in query text (unsafe)" option is on.
 */
export const resolveQueryText = (
  label: string,
  data: { query?: string; allowQueryExpressions?: unknown },
  context: WorkflowContext
): string => {
  const query = data.query ?? "";

  if (!hasQueryExpressions(query)) {
    // Nothing to render: the text is sent exactly as it was written
    const text = query.trim();
    if (!text) throw new NonRetriableError(`${label} node: Query is required`);
    return text;
  }

  if (!allowsQueryExpressions(data.allowQueryExpressions)) {
    throw new NonRetriableError(
      `${label} node: the query text contains {{ }} expressions, and their values are not escaped. ` +
        `Put a placeholder in the query and the expression in Query Parameters, ` +
        `or turn on "${ALLOW_QUERY_EXPRESSIONS_LABEL}" in the node.`
    );
  }

  const text = renderTemplate(query, context).trim();
  if (!text) throw new NonRetriableError(`${label} node: Query is required`);
  return text;
};

const renderParameter = (value: unknown, context: WorkflowContext): unknown =>
  typeof value === "string" && value.includes("{{")
    ? renderTemplate(value, context)
    : value;

/**
 * The values for the query's placeholders, from the Query Parameters field:
 * a JSON array that may hold expressions. The driver sends them apart from
 * the SQL, so they can never change the query.
 *
 * Written as ["{{webhook.body.email}}"], each text value is rendered on its
 * own, so quotes and line breaks in it are kept as they are. Anything else,
 * such as [{{webhook.body.id}}] or {{json ids}}, is rendered first and then
 * read as JSON.
 */
export const resolveQueryParameters = (
  label: string,
  paramsJson: string | undefined,
  context: WorkflowContext
): unknown[] => {
  const raw = (paramsJson ?? "").trim();
  if (!raw) return [];

  let values: unknown;
  let rendered = false;

  try {
    values = JSON.parse(raw);
  } catch {
    values = parseJsonField<unknown>(
      label,
      "Query Parameters",
      renderTemplate(raw, context).trim()
    );
    rendered = true;
  }

  if (!Array.isArray(values)) {
    throw new NonRetriableError(
      `${label} node: Query Parameters must be a JSON array`
    );
  }

  return rendered
    ? values
    : values.map((value) => renderParameter(value, context));
};
