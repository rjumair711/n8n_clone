import { randomBytes } from "node:crypto";
import { NonRetriableError } from "inngest";
import type { WorkflowContext } from "../types";
import { renderTemplate } from "./templates";

// When an SSH node is an AI Agent tool, the model chooses the values of
// {{$fromAI "..."}}. They come from whatever the model has read, so each one
// is quoted for the shell automatically: it reaches the command as a single
// argument, whatever it contains.
//
// The values are quoted where they land, not before rendering, because the
// right quoting depends on the place: a value typed inside '...' or "..."
// needs different escaping than one standing on its own.

const UNSAFE_PLACE_MESSAGE =
  "SSH node: as an AI Agent tool, a $fromAI value cannot be used inside backticks, $(( )), a # comment, $'...' or after a heredoc (<<), because it cannot be quoted safely there. Use it as a normal argument instead.";

const TRANSFORMED_MESSAGE =
  "SSH node: as an AI Agent tool, a $fromAI text value must be inserted as it is. The command changes it in an expression (for example .toUpperCase() or .slice()), so it cannot be quoted safely.";

export type AiShellTokens = {
  // Goes into the context as `ai` while the command is rendered
  ai: Record<string, unknown>;
  // Placeholder -> the text the model chose
  values: Map<string, string>;
  id: string;
};

const quoteWord = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

/**
 * Replaces the model's text arguments with placeholders that survive
 * rendering. Numbers and booleans cannot carry shell syntax, so they stay as
 * they are and still work in arithmetic such as {{ $fromAI('n') + 1 }}.
 */
export const tokenizeAiValues = (ai: Record<string, unknown>): AiShellTokens => {
  const id = randomBytes(8).toString("hex");
  const values = new Map<string, string>();
  const tokens: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(ai)) {
    if (
      value === null ||
      value === undefined ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    ) {
      tokens[key] = value;
      continue;
    }

    const token = `RXJAI${id}N${values.size}E`;
    values.set(token, typeof value === "object" ? JSON.stringify(value) : String(value));
    tokens[key] = token;
  }

  return { ai: tokens, values, id };
};

type Frame = {
  // What closes this level: nothing (the command itself), ")" for $( ), or a
  // level in which values cannot be quoted safely (backticks, $(( )))
  kind: "top" | "substitution" | "unsafe";
  closesWith: "" | ")" | "`";
  quote: "" | "'" | '"' | "ansi";
  parens: number;
};

/**
 * Puts the model's values into a rendered command, each quoted for the place
 * it stands in. Throws when a value stands somewhere it cannot be made safe.
 */
export const quoteAiValuesInCommand = (
  command: string,
  { values, id }: AiShellTokens
): string => {
  if (values.size === 0) return command;

  const prefix = `RXJAI${id}N`;
  const tokenPattern = new RegExp(`${prefix}(\\d+)E`, "y");

  // A placeholder that no longer matches was changed by an expression
  const leftovers = command.replace(new RegExp(`${prefix}\\d+E`, "g"), "");
  if (leftovers.toLowerCase().includes(`rxjai${id}`)) {
    throw new NonRetriableError(TRANSFORMED_MESSAGE);
  }

  const stack: Frame[] = [{ kind: "top", closesWith: "", quote: "", parens: 0 }];
  let output = "";
  let inComment = false;
  let heredocSeen = false;
  let atWordStart = true;

  for (let index = 0; index < command.length; index++) {
    const frame = stack[stack.length - 1];
    const char = command[index];

    if (char === "R" && command.startsWith(prefix, index)) {
      tokenPattern.lastIndex = index;
      const match = tokenPattern.exec(command);
      const value = match ? values.get(match[0]) : undefined;

      if (match && value !== undefined) {
        if (
          inComment ||
          heredocSeen ||
          frame.quote === "ansi" ||
          stack.some((entry) => entry.kind === "unsafe")
        ) {
          throw new NonRetriableError(UNSAFE_PLACE_MESSAGE);
        }

        output +=
          frame.quote === "'"
            ? value.replace(/'/g, `'\\''`)
            : frame.quote === '"'
              ? value.replace(/[\\"$`]/g, "\\$&")
              : quoteWord(value);

        index += match[0].length - 1;
        atWordStart = false;
        continue;
      }
    }

    output += char;

    if (inComment) {
      if (char === "\n") {
        inComment = false;
        atWordStart = true;
      }
      continue;
    }

    if (frame.quote === "'") {
      if (char === "'") frame.quote = "";
      continue;
    }

    const next = command[index + 1];

    // A backslash takes the next character with it (not inside '...')
    if (char === "\\" && next !== undefined) {
      output += next;
      index++;
      atWordStart = false;
      continue;
    }

    if (frame.quote === "ansi") {
      if (char === "'") frame.quote = "";
      continue;
    }

    // Backticks end at the next backtick, whatever is open inside them
    if (char === "`") {
      const open = stack.findLastIndex((entry) => entry.closesWith === "`");

      if (open > 0) stack.length = open;
      else stack.push({ kind: "unsafe", closesWith: "`", quote: "", parens: 0 });

      atWordStart = false;
      continue;
    }

    if (char === "$" && next === "(") {
      const arithmetic = command[index + 2] === "(";

      output += arithmetic ? "((" : "(";
      index += arithmetic ? 2 : 1;
      stack.push({
        kind: arithmetic ? "unsafe" : "substitution",
        closesWith: ")",
        quote: "",
        // $(( closes with two ")"
        parens: arithmetic ? 1 : 0,
      });
      atWordStart = true;
      continue;
    }

    if (frame.quote === '"') {
      if (char === '"') frame.quote = "";
      continue;
    }

    // Outside of quotes from here on
    if (char === "'" || char === '"') {
      frame.quote = char;
      atWordStart = false;
    } else if (char === "$" && next === "'") {
      output += next;
      index++;
      frame.quote = "ansi";
      atWordStart = false;
    } else if (char === "(") {
      frame.parens++;
      atWordStart = true;
    } else if (char === ")") {
      if (frame.parens > 0) frame.parens--;
      else if (frame.closesWith === ")" && stack.length > 1) stack.pop();
      atWordStart = false;
    } else if (char === "#" && atWordStart) {
      inComment = true;
    } else if (char === "<" && next === "<") {
      if (command[index + 2] === "<") {
        // "<<<" is a here-string: what follows is an ordinary word
        output += "<<";
        index += 2;
      } else {
        heredocSeen = true;
      }
      atWordStart = true;
    } else {
      atWordStart = /[\s;|&]/.test(char);
    }
  }

  return output;
};

/**
 * Renders an SSH command for a run as an AI Agent tool: every text value the
 * model supplied ({{$fromAI "x"}}, {{ $fromAI('x') }}, {{ai.x}}) is quoted.
 */
export const renderAgentShellCommand = (
  template: string | undefined,
  context: WorkflowContext
): string => {
  const ai = context.ai;

  if (!ai || typeof ai !== "object" || Array.isArray(ai)) {
    return renderTemplate(template, context);
  }

  const tokens = tokenizeAiValues(ai as Record<string, unknown>);

  return quoteAiValuesInCommand(
    renderTemplate(template, { ...context, ai: tokens.ai }),
    tokens
  );
};
