// Used by the editor as well as the executors: keep this file free of
// server-only imports

// Shown under the Query field of the Postgres and MySQL nodes
export const QUERY_EXPRESSION_WARNING =
  "Values in the query text are not escaped. Use Query Parameters instead.";

export const ALLOW_QUERY_EXPRESSIONS_LABEL =
  "Allow expressions in query text (unsafe)";

/**
 * True when the SQL text holds a {{ ... }} expression. Whatever such an
 * expression renders to is pasted into the SQL as it is, so a value that
 * came from outside (a webhook, a form, a chat message) could change the
 * query.
 */
export const hasQueryExpressions = (query: unknown): boolean =>
  typeof query === "string" && /\{\{[\s\S]*?\}\}/.test(query);

// The option is saved as "true" by the settings dialog; nodes saved before
// it existed have no value, which means off
export const allowsQueryExpressions = (value: unknown): boolean =>
  value === true || value === "true";
