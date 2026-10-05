import Handlebars from "handlebars";
import type { WorkflowContext } from "../types";
import { evaluateExpressions, isN8nExpression } from "./expressions";

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

// {{shellQuote webhook.body.name}}: for the SSH node, wraps a value so the
// remote shell reads it as one argument whatever it contains
Handlebars.registerHelper(
  "shellQuote",
  (value) =>
    new Handlebars.SafeString(
      `'${String(value ?? "").replace(/'/g, `'\\''`)}'`
    )
);

if (!Handlebars.helpers.json) {
  Handlebars.registerHelper("json", (value) => {
    return new Handlebars.SafeString(JSON.stringify(value, null, 2));
  });
}

// Stands in for a "}" that directly follows an expression
const BRACE_PLACEHOLDER = "\u0001";
// Wraps the index of an n8n expression whose result is inserted at the end
const EXPRESSION_PLACEHOLDER = "\u0002";

/**
 * Finds the end of the expression that starts at "start" (just after "{{"):
 * the first "}}" that is not inside a string or a nested { } block, so
 * JavaScript such as {{ $json.items.map((i) => { return i.id }) }} works.
 * Returns -1 when the expression is never closed.
 */
const findExpressionEnd = (template: string, start: number): number => {
  let depth = 0;
  let quote = "";

  for (let index = start; index < template.length; index++) {
    const char = template[index];

    if (quote) {
      if (char === "\\") index++;
      else if (char === quote) quote = "";
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
    } else if (char === "{") {
      depth++;
    } else if (char === "}") {
      if (depth > 0) depth--;
      else if (template[index + 1] === "}") return index;
    }
  }

  return -1;
};

/**
 * Replaces every n8n expression in the template with a placeholder and
 * collects the expressions. Handlebars expressions are left as they are.
 */
const extractExpressions = (template: string, expressions: string[]): string => {
  let output = "";
  let position = 0;

  while (position < template.length) {
    const open = template.indexOf("{{", position);
    if (open === -1) break;

    const triple = template[open + 2] === "{";
    const start = open + (triple ? 3 : 2);
    const end = findExpressionEnd(template, start);

    // Not an expression after all: keep the braces as text and move on
    if (end === -1) {
      output += template.slice(position, open + 2);
      position = open + 2;
      continue;
    }

    const inner = template.slice(start, end);
    // "{{{ x }}}": the third brace belongs to the expression
    const after = end + (triple && template[end + 2] === "}" ? 3 : 2);

    if (isN8nExpression(inner)) {
      expressions.push(inner);
      output +=
        template.slice(position, open) +
        EXPRESSION_PLACEHOLDER +
        (expressions.length - 1) +
        EXPRESSION_PLACEHOLDER;
    } else {
      output += template.slice(position, after);
    }

    position = after;
  }

  return output + template.slice(position);
};

const render = (
  template: string | undefined,
  context: WorkflowContext,
  escapeValues: boolean
): string => {
  if (!template) return "";

  // 1. n8n expressions ({{ $json.name }}, {{ $('node').item.json.id }}) are
  //    JavaScript. They are taken out before Handlebars sees them.
  const expressions: string[] = [];

  const withoutExpressions = template.includes("$")
    ? extractExpressions(template, expressions)
    : template;

  // 2. JSON such as {"tags": {{json tags}}} ends in "}}}", which Handlebars
  //    reads as the end of a {{{raw}}} expression and rejects
  const safeTemplate = withoutExpressions.replace(
    /(?<!\{)(\{\{(?!\{)[^{}]+\}\})\}/g,
    `$1${BRACE_PLACEHOLDER}`
  );

  let output = Handlebars.compile(safeTemplate, { noEscape: !escapeValues })(context)
    .split(BRACE_PLACEHOLDER)
    .join("}");

  if (expressions.length > 0) {
    const results = evaluateExpressions(expressions, context);

    output = output
      .split(EXPRESSION_PLACEHOLDER)
      // Odd parts are the indexes between two placeholders
      .map((part, index) => {
        if (index % 2 === 0) return part;

        const value = results[Number(part)] ?? "";

        return escapeValues ? Handlebars.escapeExpression(value) : value;
      })
      .join("");
  }

  return output;
};

// Renders {{variables}} and n8n expressions without HTML-escaping the values
export const renderTemplate = (
  template: string | undefined,
  context: WorkflowContext
): string => render(template, context, false);

/**
 * The same, with Handlebars' default HTML-escaping of values. Used by the
 * nodes that have always rendered that way, so their output does not change.
 */
export const renderEscapedTemplate = (
  template: string | undefined,
  context: WorkflowContext
): string => render(template, context, true);
