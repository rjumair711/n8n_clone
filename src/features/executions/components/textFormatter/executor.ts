import type { NodeExecutor } from "@/features/executions/types";
import { NonRetriableError } from "inngest";
import Handlebars from "handlebars";

type TextOperation = "uppercase" | "lowercase" | "trim" | "replace" | "extract";

export type TextFormatterData = {
  variableName?: string;
  operation?: TextOperation;
  inputText?: string;
  searchString?: string;
  replaceString?: string;
  regexPattern?: string;
};

export const textFormatterExecutor: NodeExecutor<TextFormatterData> = async ({
  data,
  context,
  step,
}) => {
  if (!data.variableName) throw new NonRetriableError("Text Formatter node: Variable name is missing");
  if (!data.inputText) throw new NonRetriableError("Text Formatter node: Input text is missing");

  const operation = data.operation || "trim";

  // Interpolate potential variables in the input text
  const rawInput = Handlebars.compile(data.inputText)(context);

  let resultOutput: any = {};

  try {
    resultOutput = await step.run("execute-text-formatter", async () => {
      let finalString = "";

      switch (operation) {
        case "uppercase":
          finalString = rawInput.toUpperCase();
          break;

        case "lowercase":
          finalString = rawInput.toLowerCase();
          break;

        case "trim":
          finalString = rawInput.trim();
          break;

        case "replace":
          if (!data.searchString) throw new Error("Search string is required for Replace operation");
          // Global replace, escaping special regex characters just in case it's a plain string
          const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(escapeRegExp(data.searchString), 'g');
          finalString = rawInput.replace(regex, data.replaceString || "");
          break;

        case "extract":
          if (!data.regexPattern) throw new Error("Regex pattern is required for Extract operation");
          const extractRegex = new RegExp(data.regexPattern);
          const match = rawInput.match(extractRegex);
          finalString = match ? match[0] : "";
          break;

        default:
          throw new Error(`Unsupported operation: ${operation}`);
      }

      return {
        result: finalString,
        original: rawInput,
        length: finalString.length
      };
    });

    return {
      ...context,
      [data.variableName]: resultOutput,
    };
    
  } catch (error: any) {
    throw new NonRetriableError(`Text Formatter node failed: ${error.message}`);
  }
};