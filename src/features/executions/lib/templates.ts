import Handlebars from "handlebars";
import type { WorkflowContext } from "../types";

/**
 * `{{$fromAI "city" "The city to look up" "string"}}`
 *
 * Marks a field of a tool node as "filled in by the AI Agent", like n8n's
 * $fromAI(). When the agent calls the tool, the value it chose is available
 * under `ai` in the context; outside of an agent the helper renders nothing.
 */
const fromAI = function (this: unknown, key: unknown, ...rest: unknown[]) {
  const options = rest[rest.length - 1] as Handlebars.HelperOptions;
  const args = (options?.data?.root?.ai ?? {}) as Record<string, unknown>;
  const value = args[String(key)];

  if (value === undefined || value === null) return "";

  return new Handlebars.SafeString(
    typeof value === "object" ? JSON.stringify(value) : String(value)
  );
};

Handlebars.registerHelper("$fromAI", fromAI);
Handlebars.registerHelper("fromAI", fromAI);

if (!Handlebars.helpers.json) {
  Handlebars.registerHelper("json", (value) => {
    return new Handlebars.SafeString(JSON.stringify(value, null, 2));
  });
}

// Renders {{variables}} without HTML-escaping the values
export const renderTemplate = (
  template: string | undefined,
  context: WorkflowContext
): string => {
  if (!template) return "";

  return Handlebars.compile(template, { noEscape: true })(context);
};
