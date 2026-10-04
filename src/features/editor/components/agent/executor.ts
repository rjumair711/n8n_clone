import { tool, type ModelMessage, type ToolSet } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { NonRetriableError } from "inngest";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import type {
  NodeExecutor,
  NodeWithCredential,
  WorkflowContext,
} from "@/features/executions/types";
import { NodeType } from "@prisma/client";
import { executorRegistry } from "@/features/executions/lib/executor-registry";
import { renderTemplate } from "@/features/executions/lib/templates";
import {
  buildToolInputSchema,
  extractAIParameters,
  getDefaultToolDescription,
  getDefaultToolName,
  sanitizeToolName,
  uniqueToolName,
} from "@/features/executions/lib/agent-tools";
import { AGENT_DEFAULT_MAX_ITERATIONS, runAgentLoop } from "./agent-loop";

export type AIAgentData = {
  // "auto": read the prompt from the previous node (chatInput), like n8n's
  // "Take from previous node automatically". "define": use `text`.
  promptType?: "auto" | "define";
  text?: string;
  systemMessage?: string;
  maxIterations?: number;
  returnIntermediateSteps?: boolean;
  variableName?: string;
  // Name / description the model sees for each connected tool node
  toolSettings?: Record<string, { name?: string; description?: string }>;

  // Legacy fields, used when no Chat Model node is connected
  provider?: "OPENAI" | "ANTHROPIC" | "GEMINI";
  credentialId?: string;
  modelName?: string;
  systemPrompt?: string;
};

type Provider = "OPENAI" | "ANTHROPIC" | "GEMINI";

const MODEL_NODE_PROVIDERS: Record<string, Provider> = {
  OPENAI: "OPENAI",
  ANTHROPIC: "ANTHROPIC",
  GEMINI: "GEMINI",
};

// Same defaults the standalone model nodes use
const DEFAULT_MODELS: Record<Provider, string> = {
  OPENAI: "gpt-4o-mini",
  ANTHROPIC: "claude-3-5-sonnet",
  GEMINI: "gemini-2.5-flash",
};

const DEFAULT_SYSTEM_MESSAGE = "You are a helpful assistant";
const MAX_TOOL_RESULT_CHARS = 20000;

const readPath = (context: WorkflowContext, path: string[]): unknown =>
  path.reduce<unknown>(
    (current, key) =>
      current && typeof current === "object"
        ? (current as Record<string, unknown>)[key]
        : undefined,
    context
  );

/**
 * "Take from previous node automatically": n8n looks for `chatInput`.
 * Webhook bodies are accepted too so an API can drive the agent.
 */
const findAutomaticPrompt = (context: WorkflowContext): string => {
  const candidates = [
    ["chatInput"],
    ["webhook", "body", "chatInput"],
    ["webhook", "body", "message"],
    ["message"],
  ];

  for (const path of candidates) {
    const value = readPath(context, path);
    if (typeof value === "string" && value.trim()) return value;
  }

  return "";
};

export const aiAgentExecutor: NodeExecutor<AIAgentData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
  allNodes,
  connections,
}) => {
  const maxIterations =
    Number(data.maxIterations) || AGENT_DEFAULT_MAX_ITERATIONS;
  const targetOutputKey = data.variableName?.trim() || "aiAgentOutput";

  // =========================================================================
  // 1. SUB-NODES: what is plugged into the Chat Model / Memory / Tools ports
  // =========================================================================
  const incomingEdges = connections.filter((edge) => edge.toNodeId === nodeId);

  let modelNode: NodeWithCredential | undefined;
  let memoryNode: NodeWithCredential | undefined;
  const toolNodes: NodeWithCredential[] = [];

  for (const edge of incomingEdges) {
    const sourceNode = allNodes.find((node) => node.id === edge.fromNodeId);
    if (!sourceNode) continue;

    const handle = (edge.toInput || "").toLowerCase();

    if (handle.includes("tool")) {
      toolNodes.push(sourceNode);
    } else if (
      handle.includes("model") ||
      sourceNode.type in MODEL_NODE_PROVIDERS
    ) {
      modelNode ??= sourceNode;
    } else if (
      handle.includes("memory") ||
      sourceNode.type === NodeType.BUFFER_MEMORY
    ) {
      memoryNode ??= sourceNode;
    }
    // Anything else is the main "flow-in" connection, which is not a tool
  }

  // =========================================================================
  // 2. CHAT MODEL
  // =========================================================================
  const modelData = (modelNode?.data ?? {}) as Record<string, any>;

  const provider: Provider | undefined = modelNode
    ? MODEL_NODE_PROVIDERS[modelNode.type]
    : data.provider;

  if (!provider) {
    throw new NonRetriableError(
      "AI Agent: a Chat Model node must be connected to the Chat Model port"
    );
  }

  const modelName: string =
    modelData.model ||
    modelData.modelName ||
    (modelNode ? "" : data.modelName) ||
    DEFAULT_MODELS[provider];

  const credentialId: string | undefined = modelNode
    ? modelData.credentialId || modelNode.credentialId
    : data.credentialId;

  if (!credentialId) {
    throw new NonRetriableError(
      "AI Agent: the connected Chat Model node has no credential selected"
    );
  }

  const credential = await step.run("get-agent-model-credential", async () => {
    // Scoped to the workflow owner: never use another user's credential
    return prisma.credential.findUnique({
      where: { id: credentialId, userId },
    });
  });

  if (!credential) {
    throw new NonRetriableError("AI Agent: Chat Model credential not found");
  }

  // =========================================================================
  // 3. PROMPT
  // =========================================================================
  const promptType = data.promptType || "auto";

  const prompt =
    promptType === "define"
      ? renderTemplate(data.text, context).trim()
      : findAutomaticPrompt(context);

  if (!prompt) {
    throw new NonRetriableError(
      promptType === "define"
        ? "AI Agent: the Prompt (User Message) is empty"
        : "AI Agent: no prompt specified. Expected to find the prompt in a field called 'chatInput' (this is what the Chat Trigger outputs). To use something else, set Source for Prompt to 'Define below'."
    );
  }

  const system =
    renderTemplate(data.systemMessage ?? data.systemPrompt, context).trim() ||
    DEFAULT_SYSTEM_MESSAGE;

  // =========================================================================
  // 4. MEMORY: previous turns of this session become real chat messages
  // =========================================================================
  const memoryData = (memoryNode?.data ?? {}) as Record<string, any>;

  const sessionId = memoryNode
    ? renderTemplate(memoryData.sessionId || "{{sessionId}}", context).trim() ||
      (typeof context.sessionId === "string" ? context.sessionId : "") ||
      "default"
    : "";

  let history: ModelMessage[] = [];

  if (memoryNode) {
    const memoryNodeId = memoryNode.id;
    const windowSize = Number(memoryData.windowSize) || 10;

    history = await step.run("retrieve-agent-memory", async () => {
      const rows = await prisma.agentMemory.findMany({
        where: { nodeId: memoryNodeId, userId, sessionId },
        take: windowSize,
        orderBy: { createdAt: "desc" },
      });

      const messages = rows.reverse().map((row) => ({
        role: row.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: row.content,
      }));

      // A conversation has to start with the user's turn
      while (messages.length > 0 && messages[0].role !== "user") {
        messages.shift();
      }

      return messages;
    });
  }

  const messages: ModelMessage[] = [
    ...history,
    { role: "user", content: prompt },
  ];

  // =========================================================================
  // 5. TOOLS: every node on the Tools port becomes a function the model can call
  // =========================================================================
  // Tools run inside the agent's own step, so their step calls run inline
  const inlineStep = {
    ...step,
    run: async (_id: unknown, fn: () => unknown) => fn(),
    sleep: async () => {},
    sleepUntil: async () => {},
    sendEvent: async () => ({ ids: [] }),
    ai: {
      ...step.ai,
      wrap: async (_id: unknown, fn: (...args: any[]) => unknown, ...args: any[]) =>
        fn(...args),
    },
  } as unknown as typeof step;

  const tools: ToolSet = {};
  const takenNames = new Set<string>();

  for (const toolNode of toolNodes) {
    const executor = executorRegistry[toolNode.type as NodeType];
    if (!executor) continue;

    const toolData = (toolNode.data ?? {}) as Record<string, unknown>;
    const settings = data.toolSettings?.[toolNode.id] ?? {};

    const name = uniqueToolName(
      sanitizeToolName(settings.name || "") || getDefaultToolName(toolNode.type),
      takenNames
    );

    tools[name] = tool({
      description:
        settings.description?.trim() ||
        getDefaultToolDescription(toolNode.type, toolData),
      inputSchema: buildToolInputSchema(extractAIParameters(toolData)),
      execute: async (input: Record<string, unknown>) => {
        // The model's arguments are exposed as {{$fromAI "key"}} / {{ai.key}}
        const toolContext: WorkflowContext = { ...context, ai: input };

        try {
          const output = await executor({
            data: toolData,
            nodeId: toolNode.id,
            userId,
            allNodes,
            connections,
            step: inlineStep,
            context: toolContext,
          });

          // Hand back only what the tool produced, not the whole context
          const produced: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(output)) {
            if (key !== "ai" && toolContext[key] !== value) {
              produced[key] = value;
            }
          }

          const keys = Object.keys(produced);
          const result = keys.length === 1 ? produced[keys[0]] : produced;
          const serialized = JSON.stringify(result ?? null);

          return serialized.length > MAX_TOOL_RESULT_CHARS
            ? `${serialized.slice(0, MAX_TOOL_RESULT_CHARS)}... [truncated]`
            : result;
        } catch (error: any) {
          // The model sees the failure and can retry or explain it
          return {
            error: error?.message || "The tool failed to run",
          };
        }
      },
    });
  }

  // =========================================================================
  // 6. RUN THE AGENT
  // =========================================================================
  const agentResult = await step.run("execute-agent-llm-loop", async () => {
    try {
      const apiKey = decrypt(credential.value).trim();

      const model =
        provider === "OPENAI"
          ? createOpenAI({ apiKey })(modelName)
          : provider === "ANTHROPIC"
            ? createAnthropic({ apiKey })(modelName)
            : createGoogleGenerativeAI({ apiKey })(modelName);

      return await runAgentLoop({
        model,
        system,
        messages,
        tools,
        maxIterations,
      });
    } catch (error: any) {
      console.error(`[AI Agent Error]: Failed to communicate with ${provider}`, error);

      // Stop immediately and mark the AI Agent node as FAILED
      throw new NonRetriableError(
        `LLM Provider Error (${provider}): ${error.message || "Failed to generate response."}`
      );
    }
  });

  // =========================================================================
  // 7. SAVE THIS TURN TO MEMORY
  // =========================================================================
  if (memoryNode) {
    const memoryNodeId = memoryNode.id;

    await step.run("persist-agent-memory", async () => {
      await prisma.agentMemory.createMany({
        data: [
          {
            nodeId: memoryNodeId,
            userId,
            role: "user",
            content: prompt,
            sessionId,
          },
          {
            nodeId: memoryNodeId,
            userId,
            role: "assistant",
            content: agentResult.output,
            sessionId,
          },
        ],
      });
    });
  }

  const agentOutput = {
    output: agentResult.output,
    // Kept for workflows that referenced {{aiAgentOutput.response}}
    response: agentResult.output,
    ...(data.returnIntermediateSteps
      ? { intermediateSteps: agentResult.intermediateSteps }
      : {}),
    usage: agentResult.usage,
    modelUsed: modelName,
  };

  return {
    ...context,
    [targetOutputKey]: agentOutput,
    // n8n exposes the answer as `output`
    output: agentResult.output,
  };
};
