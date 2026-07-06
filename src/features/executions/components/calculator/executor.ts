import type { NodeExecutor } from "@/features/executions/types";
import { NonRetriableError } from "inngest";
import Handlebars from "handlebars";

type CalculatorOperation = "add" | "subtract" | "multiply" | "divide" | "round" | "floor" | "ceil";

export type CalculatorNodeData = {
    variableName?: string;
    operation?: CalculatorOperation;
    inputA?: string;
    inputB?: string;
};

export const calculatorExecutor: NodeExecutor<CalculatorNodeData> = async ({
    data,
    context,
    step,
}) => {
    if (!data.variableName) throw new NonRetriableError("Calculator node: Variable name is missing");
    if (!data.inputA) throw new NonRetriableError("Calculator node: Value A is missing");

    const operation = data.operation || "add";

    // Interpolate potential variables in the inputs
    const rawInputA = Handlebars.compile(data.inputA)(context);
    const numA = parseFloat(rawInputA);

    if (isNaN(numA)) {
        throw new NonRetriableError(`Calculator node: Failed to parse Value A ('${rawInputA}') as a number.`);
    }

    let numB = 0;
    const isBinaryOperation = ["add", "subtract", "multiply", "divide"].includes(operation);

    if (isBinaryOperation) {
        if (!data.inputB) throw new NonRetriableError("Calculator node: Value B is required for this operation");
        const rawInputB = Handlebars.compile(data.inputB)(context);
        numB = parseFloat(rawInputB);
        
        if (isNaN(numB)) {
            throw new NonRetriableError(`Calculator node: Failed to parse Value B ('${rawInputB}') as a number.`);
        }
    }

    let resultOutput: any = {};

    try {
        resultOutput = await step.run("execute-calculator", async () => {
            let finalNumber = 0;

            switch (operation) {
                case "add":
                    finalNumber = numA + numB;
                    break;
                case "subtract":
                    finalNumber = numA - numB;
                    break;
                case "multiply":
                    finalNumber = numA * numB;
                    break;
                case "divide":
                    if (numB === 0) throw new Error("Division by zero is not allowed.");
                    finalNumber = numA / numB;
                    break;
                case "round":
                    finalNumber = Math.round(numA);
                    break;
                case "floor":
                    finalNumber = Math.floor(numA);
                    break;
                case "ceil":
                    finalNumber = Math.ceil(numA);
                    break;
                default:
                    throw new Error(`Unsupported operation: ${operation}`);
            }

            return {
                result: finalNumber,
                formula: isBinaryOperation 
                    ? `${numA} ${operation} ${numB}` 
                    : `${operation}(${numA})`
            };
        });

        return {
            ...context,
            [data.variableName]: resultOutput,
        };

    } catch (error: any) {
        throw new NonRetriableError(`Calculator node failed: ${error.message}`);
    }
};