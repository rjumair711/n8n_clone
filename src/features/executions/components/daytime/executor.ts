import type { NodeExecutor } from "@/features/executions/types";
import { NonRetriableError } from "inngest";
import Handlebars from "handlebars";
import dayjs, { ManipulateType, OpUnitType } from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

// Initialize Day.js plugins
dayjs.extend(utc);
dayjs.extend(timezone);

type DateOperation = "current" | "format" | "manipulate" | "compare";

export type DateTimeData = {
  variableName?: string;
  operation?: DateOperation;
  timezone?: string;
  inputDate?: string;
  formatString?: string;
  action?: "add" | "subtract";
  amount?: number;
  unit?: ManipulateType & OpUnitType; // dayjs unit types
  compareDate?: string;
};

export const dateTimeExecutor: NodeExecutor<DateTimeData> = async ({
  data,
  context,
  step,
}) => {
  // ==========================================
  // 1. VALIDATION
  // ==========================================
  if (!data.variableName) throw new NonRetriableError("Date Time node: Variable name is missing");
  const operation = data.operation || "current";
  const tz = data.timezone || "UTC";

  // ==========================================
  // 2. TEMPLATE INTERPOLATION & DATE PARSING
  // ==========================================
  
  // Resolve input date (if empty, defaults to current time)
  const rawInput = data.inputDate ? Handlebars.compile(data.inputDate)(context) : undefined;
  
  // Determine base date locked to the requested timezone
  const baseDate = rawInput ? dayjs(rawInput).tz(tz) : dayjs().tz(tz);
  
  if (!baseDate.isValid()) {
    throw new NonRetriableError(`Date Time node: Invalid input date provided -> ${rawInput}`);
  }

  // ==========================================
  // 3. EXECUTION LAYER
  // ==========================================
  let resultOutput: any = {};

  try {
    // Run execution inside Inngest step for deterministic state caching
    resultOutput = await step.run("execute-date-time", async () => {
      
      switch (operation) {
        case "current":
        case "format":
          return {
            result: baseDate.format(data.formatString || "YYYY-MM-DDTHH:mm:ssZ"),
            iso: baseDate.toISOString(),
            unix: baseDate.unix(),
          };

        case "manipulate":
          const amount = data.amount || 0;
          const unit = data.unit || "days";
          const manipulated = data.action === "subtract" 
            ? baseDate.subtract(amount, unit) 
            : baseDate.add(amount, unit);

          return {
            result: manipulated.format(data.formatString || "YYYY-MM-DDTHH:mm:ssZ"),
            iso: manipulated.toISOString(),
            unix: manipulated.unix(),
          };

        case "compare":
          if (!data.compareDate) throw new Error("Compare Date is missing");
          const rawCompare = Handlebars.compile(data.compareDate)(context);
          const compareTarget = dayjs(rawCompare).tz(tz);
          
          if (!compareTarget.isValid()) throw new Error(`Invalid compare date -> ${rawCompare}`);

          const diffUnit = data.unit || "days";
          return {
            difference: baseDate.diff(compareTarget, diffUnit),
            isBefore: baseDate.isBefore(compareTarget),
            isAfter: baseDate.isAfter(compareTarget),
            isSame: baseDate.isSame(compareTarget, diffUnit),
          };

        default:
          throw new Error(`Unsupported operation: ${operation}`);
      }
    });

    // ==========================================
    // 4. IMMUTABLE CONTEXT UPDATE
    // ==========================================
    return {
      ...context,
      [data.variableName]: resultOutput,
    };
    
  } catch (error: any) {
    throw new NonRetriableError(`Date Time node failed: ${error.message}`);
  }
};