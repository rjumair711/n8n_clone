import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { NonRetriableError } from "inngest";
import Handlebars from "handlebars";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { NodeExecutor } from "@/features/executions/types";
import { z } from "zod";
import { NodeType } from "@prisma/client";
import { executorRegistry } from "@/features/executions/lib/executor-registry";

// NOTE: Import your Inngest client here to broadcast real-time thoughts to your UI
// import { inngest } from "@/inngest/client";

type AIAgentData = {
  provider?: "OPENAI" | "ANTHROPIC" | "GEMINI";
  credentialId?: string;
  modelName?: string;
  systemPrompt?: string;
  maxIterations?: number;
  variableName?: string;
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
  const rawSystemPrompt = data.systemPrompt?.trim() || "You are a helpful autonomous AI agent.";
  const maxIterations = data.maxIterations ?? 5;
  const targetOutputKey = data.variableName?.trim() || "aiAgentOutput";

  // =========================================================================
  // 1. SCAN CANVAS TOPOLOGY WITH INTELLIGENT NODE-TYPE AUTO-DETECTION
  // =========================================================================
  const incomingEdges = connections.filter((e: any) => e.toNodeId === nodeId);

  let overridenModel = null;
  let overridenMemory = null;
  const toolEdges: any[] = [];

  console.log(`[AI Agent Execution Node: ${nodeId}] Mapping ${incomingEdges.length} incoming connections.`);

  for (const edge of incomingEdges) {
    const sourceNode = allNodes.find((n) => n.id === edge.fromNodeId);
    if (!sourceNode) continue;

    const nodeTypeLower = sourceNode.type?.toLowerCase() || "";
    const handleLower = (edge.toInput || "").toLowerCase();

    // Route connection by verifying either handle names OR source component types
    const isModelConnection =
      handleLower.includes("model") ||
      nodeTypeLower.includes("gemini") ||
      nodeTypeLower.includes("openai") ||
      nodeTypeLower.includes("anthropic") ||
      nodeTypeLower.includes("llm");

    const isMemoryConnection =
      handleLower.includes("memory") ||
      nodeTypeLower.includes("memory");

    if (isModelConnection && !overridenModel) {
      const nodeData = (sourceNode.data as Record<string, any>) || {};
      const isGemini = nodeTypeLower.includes("gemini");
      const isOpenAI = nodeTypeLower.includes("openai");
      const isAnthropic = nodeTypeLower.includes("anthropic");

      overridenModel = {
        provider: nodeData.provider || (isGemini ? "GEMINI" : isOpenAI ? "OPENAI" : isAnthropic ? "ANTHROPIC" : sourceNode.type?.toUpperCase()),
        modelName: nodeData.modelName || nodeData.model || (isGemini ? "gemini-2.5-flash" : "unknown-model"),
        credentialId: sourceNode.credentialId || nodeData.credentialId,
        inlineCredential: sourceNode.credential
      };
      console.log(`-> Successfully bound Model Provider: ${overridenModel.provider} (${overridenModel.modelName})`);
    } else if (isMemoryConnection && !overridenMemory) {
      overridenMemory = {
        id: sourceNode.id,
        type: sourceNode.type,
        data: (sourceNode.data as Record<string, any>) || {}
      };
      console.log(`-> Successfully bound Context Memory Node ID: ${sourceNode.id}`);
    } else {
      toolEdges.push(edge);
    }
  }

  const dynamicTools = toolEdges.map((edge: any) => {
    const sourceNode = allNodes.find((n) => n.id === edge.fromNodeId);
    const nodeData = (sourceNode?.data as Record<string, any>) || {};

    return {
      id: sourceNode?.id,
      type: sourceNode?.type,
      name: nodeData.name || `tool_${sourceNode?.id?.replace(/-/g, '_')}`,
      description: nodeData.description || `Executes pipeline actions for connected ${sourceNode?.type} node.`,
      nodeData: nodeData,
    };
  });

  // =========================================================================
  // 2. RESOLVE CREDENTIALS & INSTANTIATE PROVIDERS
  // =========================================================================
  const executionProvider = overridenModel?.provider || data.provider;
  const executionModelName = overridenModel?.modelName || data.modelName;

  if (!executionProvider || !executionModelName) {
    throw new NonRetriableError("AI Agent configuration missing: Model and Provider details are unmapped.");
  }

  let targetCredential = overridenModel?.inlineCredential;
  if (!targetCredential) {
    const executionCredentialId = overridenModel?.credentialId || data.credentialId;
    if (!executionCredentialId) {
      throw new NonRetriableError(`AI Agent [${nodeId}] requires a Chat Model node connection.`);
    }
    targetCredential = await prisma.credential.findUnique({ where: { id: executionCredentialId } });
  }

  if (!targetCredential) {
    throw new NonRetriableError("Linked workspace credential payload could not be verified.");
  }

  const decryptedKey = decrypt(targetCredential.value).trim();
  let apiKey = decryptedKey;
  try {
    const parsed = JSON.parse(decryptedKey);
    apiKey = parsed.apiKey || parsed.token || decryptedKey;
  } catch { }

  // =========================================================================
  // 3. HANDLE MEMORY RETRIEVAL
  // =========================================================================
  let pastChatHistory = "";
  let resolvedSessionId = "";

  if (overridenMemory) {
    const memoryData = (overridenMemory.data as Record<string, any>) || {};
    const rawSessionId = memoryData.sessionId || "{{webhook.sessionId}}";
    try {
      resolvedSessionId = Handlebars.compile(rawSessionId)(context);
    } catch {
      resolvedSessionId = rawSessionId;
    }

    const userWindowSize = memoryData.windowSize;
    const dynamicLimit = userWindowSize !== undefined ? Number(userWindowSize) : 10;

    pastChatHistory = await step.run("retrieve-agent-memory", async () => {
      const memoryLogs = await prisma.agentMemory.findMany({
        where: {
          nodeId: overridenMemory!.id,
          userId,
          ...(resolvedSessionId ? { sessionId: resolvedSessionId } : {})
        },
        take: dynamicLimit,
        orderBy: { createdAt: "desc" }
      });
      return memoryLogs.map((m) => `${m.role}: ${m.content}`).reverse().join("\n");
    });
  }

  let resolvedSystemPrompt = rawSystemPrompt;
  try {
    resolvedSystemPrompt = Handlebars.compile(rawSystemPrompt)(context);
  } catch {
    console.warn("Handlebars compilation failed for system prompt, utilizing raw input.");
  }

  const compositeSystemPrompt = `${resolvedSystemPrompt}\n\n[Conversation History Memory]\n${pastChatHistory}`;
  const userMessage = context.output || context.message || `Current Context State: ${JSON.stringify(context)}`;

  // =========================================================================
  // 4. MAP COMPONENT REGISTRY TO ACTIVE AGENT TOOLS
  // =========================================================================
  const activeTools: Record<string, any> = {};

  for (const toolNode of dynamicTools) {
    if (!toolNode.id || !toolNode.type) continue;

    activeTools[toolNode.name] = {
      description: toolNode.description,
      parameters: z.object({
        inputPayload: z.any().describe(
          "JSON string or object parameters to pass directly into the tool node context."
        ),
      }),
      execute: async ({ inputPayload }: { inputPayload: any }) => {
        const targetExecutor = executorRegistry[toolNode.type as NodeType];
        if (!targetExecutor) {
          return { error: `No runtime executor found mapping to node type: ${toolNode.type}` };
        }

        try {
          let parsedArgs = {};
          if (typeof inputPayload === "string") {
            try { parsedArgs = JSON.parse(inputPayload); } catch { parsedArgs = { input: inputPayload }; }
          } else {
            parsedArgs = inputPayload || {};
          }

          const executionOutput = await targetExecutor({
            data: toolNode.nodeData,
            nodeId: toolNode.id!,
            userId,
            allNodes,
            connections,
            step: {
              ...step,
              run: async (id: string, fn: () => any) => {
                return await fn();
              }
            } as any,
            context: { ...context, ...parsedArgs }
          });

          return { status: "success", data: executionOutput };
        } catch (err: any) {
          return { status: "error", message: err.message || "Failed running node pipeline action." };
        }
      }
    };
  }

  // =========================================================================
  // 5. EXECUTE AI GENERATION LOOP
  // =========================================================================
  const agentExecutionResult = await step.run("execute-agent-llm-loop", async () => {
    try {
      let modelInstance;

      // Explicitly map providers to prevent fallback errors with future integrations
      if (executionProvider === "OPENAI") {
        modelInstance = createOpenAI({ apiKey })(executionModelName);
      } else if (executionProvider === "ANTHROPIC") {
        modelInstance = createAnthropic({ apiKey })(executionModelName);
      } else if (executionProvider === "GEMINI" || executionProvider === "GOOGLE") {
        modelInstance = createGoogleGenerativeAI({ apiKey })(executionModelName);
      } else {
        throw new NonRetriableError(`Unsupported or unmapped LLM Provider: ${executionProvider}`);
      }

      const generateOptions: any = {
        model: modelInstance,
        system: compositeSystemPrompt,
        prompt: typeof userMessage === "object" ? JSON.stringify(userMessage) : userMessage,
        temperature: 0.3,

        // ADDED: Capture every step of the agent's thought process!
        onStepFinish: async ({
          text,
          toolCalls,
          toolResults
        }: {
          text: string;
          toolCalls?: any[];
          toolResults?: any[];
        }) => {
          const stepLogs: string[] = [];

          if (toolCalls && toolCalls.length > 0) {
            toolCalls.forEach((call: any) => {
              stepLogs.push(`Agent decided to use tool: [${call.toolName}] with args: ${JSON.stringify(call.args)}`);
            });
          }

          if (toolResults && toolResults.length > 0) {
            toolResults.forEach((result: any) => {
              stepLogs.push(`Tool [${result.toolName}] returned data successfully.`);
            });
          }

          // Broadcast the thought process to the frontend channel
          if (stepLogs.length > 0) {
            // Note: Uncomment and adjust the import/path to your specific Inngest client instance
            // await inngest.send({
            //   name: "sys/channel.broadcast",
            //   data: {
            //     channel: "ai-agent-execution",
            //     events: stepLogs.map(log => ({
            //       name: "log",
            //       data: {
            //         executionId: context.executionId || "unknown", // Pass execution ID from context
            //         nodeId: nodeId,
            //         type: "THOUGHT",
            //         message: log,
            //         timestamp: new Date().toISOString()
            //       }
            //     }))
            //   }
            // });

            // Local debugging
            console.log(`[AI Agent THOUGHT - ${nodeId}]:`, stepLogs.join(" | "));
          }
        }
      };

      if (Object.keys(activeTools).length > 0) {
        generateOptions.tools = activeTools;
        generateOptions.maxSteps = maxIterations;
      }

      const result = await generateText(generateOptions);

      return {
        response: result.text || "",
        usage: result.usage,
        modelUsed: executionModelName
      };

    } catch (error: any) {
      // 🚨 INTERCEPT THE ERROR AND BLAME THE PROVIDER 🚨
      console.error(`[AI Agent Error]: Failed to communicate with ${executionProvider}`, error);

      // Throwing a NonRetriableError ensures Inngest stops immediately and marks the AI Agent node as FAILED
      throw new NonRetriableError(
        `LLM Provider Error (${executionProvider}): ${error.message || "Failed to generate response."}`
      );
    }
  });

  // =========================================================================
  // 6. PERSIST INTERACTION LOGS
  // =========================================================================
  if (overridenMemory) {
    await step.run("persist-agent-memory", async () => {
      await prisma.agentMemory.createMany({
        data: [
          {
            nodeId: overridenMemory!.id,
            userId,
            role: "user",
            content: typeof userMessage === "string" ? userMessage : JSON.stringify(userMessage),
            sessionId: resolvedSessionId || null
          },
          {
            nodeId: overridenMemory!.id,
            userId,
            role: "assistant",
            // Safe guard in case agentExecutionResult.response is typed as an object or generic '{}'
            content: typeof agentExecutionResult.response === "string"
              ? agentExecutionResult.response
              : JSON.stringify(agentExecutionResult.response),
            sessionId: resolvedSessionId || null
          }
        ]
      });
    });
  }

  return {
    ...context,
    [targetOutputKey]: agentExecutionResult,
    output: agentExecutionResult.response,
    json: agentExecutionResult
  };
};