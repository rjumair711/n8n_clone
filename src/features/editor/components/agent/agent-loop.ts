import {
  generateText,
  stepCountIs,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from "ai";

export const AGENT_DEFAULT_MAX_ITERATIONS = 10;
export const AGENT_MAX_ITERATIONS_MESSAGE =
  "Agent stopped due to max iterations.";

// Same shape n8n returns when "Return Intermediate Steps" is enabled
export type IntermediateStep = {
  action: {
    tool: string;
    toolInput: unknown;
    toolCallId: string;
  };
  observation: unknown;
};

export type AgentLoopResult = {
  output: string;
  intermediateSteps: IntermediateStep[];
  iterations: number;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
};

/**
 * The Tools Agent loop: the model answers, or asks for tools; tool results
 * are fed back until it produces a final answer or runs out of iterations.
 */
export const runAgentLoop = async ({
  model,
  system,
  messages,
  tools,
  maxIterations = AGENT_DEFAULT_MAX_ITERATIONS,
}: {
  model: LanguageModel;
  system?: string;
  messages: ModelMessage[];
  tools: ToolSet;
  maxIterations?: number;
}): Promise<AgentLoopResult> => {
  const hasTools = Object.keys(tools).length > 0;

  const result = await generateText({
    model,
    system,
    messages,
    ...(hasTools ? { tools, stopWhen: stepCountIs(maxIterations) } : {}),
  });

  const intermediateSteps: IntermediateStep[] = [];

  for (const step of result.steps) {
    for (const call of step.toolCalls) {
      const toolResult = step.toolResults.find(
        (entry) => entry.toolCallId === call.toolCallId
      );

      intermediateSteps.push({
        action: {
          tool: call.toolName,
          toolInput: call.input,
          toolCallId: call.toolCallId,
        },
        observation: toolResult?.output ?? null,
      });
    }
  }

  // The last step still wanted tools: the iteration budget ran out
  const output =
    result.text ||
    (result.finishReason === "tool-calls" ? AGENT_MAX_ITERATIONS_MESSAGE : "");

  return {
    output,
    intermediateSteps,
    iterations: result.steps.length,
    usage: {
      inputTokens: result.totalUsage.inputTokens,
      outputTokens: result.totalUsage.outputTokens,
      totalTokens: result.totalUsage.totalTokens,
    },
  };
};
