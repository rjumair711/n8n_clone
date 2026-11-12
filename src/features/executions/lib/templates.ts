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

/**
 * Whether a template is HTML: it has a tag of its own (<p>, <br>, <a href>,
 * </div>). Only the text typed in the template counts, never the values,
 * so a form answer with "<b>" in it does not turn a plain email into HTML.
 */
export const isHtmlTemplate = (template: string | undefined): boolean =>
  /<\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?\/?>/i.test(
    (template ?? "").replace(/\{\{[\s\S]*?\}\}/g, "")
  );

// Every string in the data, passed through `escape`. Plain objects and
// arrays only: anything else (a Date, a Buffer) is kept as it is.
const mapStrings = (value: unknown, escape: (text: string) => string): unknown => {
  if (typeof value === "string") return escape(value);
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, escape));

  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, mapStrings(item, escape)])
    );
  }

  return value;
};

/**
 * Renders with every value escaped by `escape` (for a format other than
 * HTML), and the text typed in the template left as it is. Helpers such as
 * {{json x}} see the escaped values too.
 */
export const renderTemplateEscapingValues = (
  template: string | undefined,
  context: WorkflowContext,
  escape: (text: string) => string
): string => render(template, mapStrings(context, escape) as WorkflowContext, false);

// The characters Telegram's MarkdownV2 reserves; each must be preceded by a
// backslash when it is meant literally
export const escapeTelegramMarkdownV2 = (text: string): string =>
  text.replace(/[\\_*[\]()~`>#+\-=|{}.!]/g, "\\$&");

// The structure of parsed JSON: every key and the type at every place, but
// not the text of the strings
const jsonShape = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(jsonShape);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((key) => [key, jsonShape((value as Record<string, unknown>)[key])])
    );
  }
  return value === null ? "null" : typeof value;
};

/**
 * Renders a JSON field (for example the Notion node's Properties) and parses
 * it. Values are used as they are, unless that changes the JSON's structure:
 * a value with a quote in it that would close its string and add keys of its
 * own. Then the value is HTML-escaped, as these nodes always did, which keeps
 * it inside its string. Returns null when the JSON is not valid either way.
 */
export const renderJsonTemplate = (
  template: string | undefined,
  context: WorkflowContext
): unknown | null => {
  const parse = (text: string): { ok: true; value: unknown } | { ok: false } => {
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch {
      return { ok: false };
    }
  };

  const escaped = parse(render(template, context, true));
  const plain = parse(render(template, context, false));

  if (plain.ok) {
    // Only valid unescaped: the template inserts a value as raw JSON on
    // purpose ("tags": {{tagList}}), which used to fail
    if (!escaped.ok) return plain.value;

    if (JSON.stringify(jsonShape(plain.value)) === JSON.stringify(jsonShape(escaped.value))) {
      return plain.value;
    }
  }

  return escaped.ok ? escaped.value : null;
};
