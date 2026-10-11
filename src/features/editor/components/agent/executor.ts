import { tool, type ModelMessage, type ToolSet } from "ai";
import { NonRetriableError } from "inngest";
import prisma from "@/lib/db";
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
  getBlockedToolsMessage,
  getDefaultToolDescription,
  getDefaultToolName,
  getToolParameters,
  getToolRisk,
  sanitizeToolName,
  uniqueToolName,
} from "@/features/executions/lib/agent-tools";
import {
  AGENT_DEFAULT_MAX_ITERATIONS,
  AGENT_DEFAULT_MAX_TOOL_CALLS,
  AGENT_MAX_ITERATIONS_MESSAGE,
  AgentToolCallLimitError,
  appendToolResults,
  runAgentLoop,
  type AgentLoopResult,
  type IntermediateStep,
} from "./agent-loop";
import { createInlineStep } from "@/features/executions/lib/inline-step";
import { parseWaitDuration } from "@/lib/execution-wait";
import {
  APPROVAL_DEFAULT_TIMEOUT_AMOUNT,
  APPROVAL_DEFAULT_TIMEOUT_UNIT,
  TOOL_APPROVAL_DEFAULT_BY_RISK,
  TOOL_EXPIRED_MESSAGE,
  TOOL_REJECTED_MESSAGE,
  toolRequiresApproval,
} from "@/lib/approvals";
import { requestApproval } from "@/features/approvals/server/wait";
import {
  getDeliveryProblem,
  type ApprovalDelivery,
} from "@/features/approvals/server/notify";
import {
  DEFAULT_MODELS,
  MODEL_NODE_PROVIDERS,
  MODEL_ROUTER_TYPE,
  getModelNodeSpecs,
  getRouterSpecs,
  getUsageProvider,
  loadModelCandidates,
  type ModelSpec,
} from "@/features/executions/lib/connected-model";
import {
  CHEAP_TIER,
  STRONG_TIER,
  buildEscalationPrompt,
  createFallbackModel,
  createModelTracker,
  describeModelAnswer,
} from "@/features/executions/lib/model-fallback";
import { extractJson } from "@/features/executions/lib/ai-fields";
import { getAiUsageScope, recordModelCalls } from "@/lib/ai-usage";
import {
  buildFactTools,
  findMessagesToSummarize,
  listContactFacts,
  loadSessionMemory,
  saveSessionSummary,
  saveSessionTurn,
} from "@/lib/agent-memory";
import {
  SUMMARY_SYSTEM,
  buildMemoryNote,
  buildSummaryPrompt,
  normalizeContactId,
  resolveMessageLimit,
  type ContactFactEntry,
} from "@/features/executions/lib/memory-options";
import {
  buildMcpTools,
  loadMcpSecret,
  type McpClientData,
} from "@/features/executions/components/ai/mcp";
import { getAgentToolProblems } from "@/features/executions/components/ai/agent-tool";

export type AIAgentData = {
  // "auto": read the prompt from the previous node (chatInput), like n8n's
  // "Take from previous node automatically". "define": use `text`.
  promptType?: "auto" | "define";
  text?: string;
  systemMessage?: string;
  maxIterations?: number;
  // Tool calls in one run, over all iterations
  maxToolCalls?: number;
  // Off unless the author switched it on: SSH, raw SQL, deletes, Execute
  // Workflow
  allowDangerousTools?: boolean;
  returnIntermediateSteps?: boolean;
  variableName?: string;
  // Name / description the model sees for each connected tool node, and
  // whether a person has to approve each of its calls
  toolSettings?: Record<
    string,
    { name?: string; description?: string; requireApproval?: boolean }
  >;
  // "risk" on agents added since approvals exist: tools without a saved
  // choice need approval when they write or are dangerous
  toolApprovalDefault?: string;
  // Where approval requests go: "in_app" (default), "email", "slack",
  // "telegram" or "whatsapp", and what that channel needs
  approvalChannel?: string;
  approvalCredentialId?: string;
  approvalRecipient?: string;
  approvalWebhookUrl?: string;
  approvalPhoneNumberId?: string;
  // How long a request can be answered, default 24 hours
  approvalTimeoutAmount?: string | number;
  approvalTimeoutUnit?: string;

  // Legacy fields, used when no Chat Model node is connected
  provider?: "OPENAI" | "ANTHROPIC" | "GEMINI";
  credentialId?: string;
  modelName?: string;
  systemPrompt?: string;
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
  executionId,
  workflowId,
  callDepth,
  agentDepth,
}) => {
  const maxIterations =
    Number(data.maxIterations) || AGENT_DEFAULT_MAX_ITERATIONS;
  const maxToolCalls = Math.max(
    Math.floor(Number(data.maxToolCalls)) || AGENT_DEFAULT_MAX_TOOL_CALLS,
    1
  );
  const targetOutputKey = data.variableName?.trim() || "aiAgentOutput";

  // =========================================================================
  // 1. SUB-NODES: what is plugged into the Chat Model / Memory / Tools ports
  // =========================================================================
  const incomingEdges = connections.filter((edge) => edge.toNodeId === nodeId);

  let modelNode: NodeWithCredential | undefined;
  let memoryNode: NodeWithCredential | undefined;
  let parserNode: NodeWithCredential | undefined;
  const toolNodes: NodeWithCredential[] = [];

  for (const edge of incomingEdges) {
    const sourceNode = allNodes.find((node) => node.id === edge.fromNodeId);
    if (!sourceNode) continue;

    const handle = (edge.toInput || "").toLowerCase();

    if (handle.includes("parser")) {
      parserNode ??= sourceNode;
    } else if (handle.includes("tool")) {
      toolNodes.push(sourceNode);
    } else if (
      handle.includes("model") ||
      sourceNode.type in MODEL_NODE_PROVIDERS
    ) {
      modelNode ??= sourceNode;
    } else if (
      handle.includes("memory") ||
      sourceNode.type === NodeType.BUFFER_MEMORY ||
      sourceNode.type === NodeType.POSTGRES_MEMORY
    ) {
      memoryNode ??= sourceNode;
    }
    // Anything else is the main "flow-in" connection, which is not a tool
  }

  // Checked before anything else runs: a dangerous tool is only usable when
  // the workflow's author allowed it on this agent
  const blockedTools = getBlockedToolsMessage(
    toolNodes.map((node) => ({
      type: node.type,
      data: node.data,
      name: data.toolSettings?.[node.id]?.name,
    })),
    data.allowDangerousTools
  );

  if (blockedTools) {
    throw new NonRetriableError(blockedTools);
  }

  // An AI Agent Tool that is not ready (no model, no description, its own
  // dangerous tools not allowed) is a mistake in the workflow: said now,
  // not handed to the model later as a tool that failed
  const agentToolProblems = getAgentToolProblems(toolNodes, allNodes, connections);

  if (agentToolProblems) {
    throw new NonRetriableError(agentToolProblems);
  }

  // =========================================================================
  // 2. CHAT MODEL
  // =========================================================================
  // A Model Router stands for two models: a cheap one that is tried first
  // and a strong one that takes over when it fails
  const routerNode =
    modelNode?.type === MODEL_ROUTER_TYPE ? modelNode : undefined;

  let specs: ModelSpec[];

  if (routerNode) {
    specs = getRouterSpecs({
      label: "AI Agent",
      routerNode,
      allNodes,
      connections,
    });
  } else if (modelNode) {
    if (!(modelNode.type in MODEL_NODE_PROVIDERS)) {
      throw new NonRetriableError(
        "AI Agent: a Chat Model node must be connected to the Chat Model port"
      );
    }

    // The node's own model, then a Chat Model node's fallbacks
    specs = getModelNodeSpecs(modelNode);
  } else {
    // Legacy: the model was set on the agent itself
    if (!data.provider) {
      throw new NonRetriableError(
        "AI Agent: a Chat Model node must be connected to the Chat Model port"
      );
    }

    specs = [
      {
        provider: data.provider,
        usageProvider: getUsageProvider(data.provider),
        modelName: data.modelName || DEFAULT_MODELS[data.provider],
        modelData: {},
        credentialId: data.credentialId,
        tier: CHEAP_TIER,
      },
    ];
  }

  if (specs.some((spec) => !spec.modelName)) {
    throw new NonRetriableError(
      "AI Agent: the connected Chat Model node has no model set"
    );
  }

  if (specs.some((spec) => !spec.credentialId)) {
    throw new NonRetriableError(
      "AI Agent: the connected Chat Model node has no credential selected"
    );
  }

  const candidates = await loadModelCandidates({
    label: "AI Agent",
    stepId: "get-agent-model-credential",
    specs,
    userId,
    step,
  });

  const { provider, modelName } = specs[0];

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

  const baseSystem =
    renderTemplate(data.systemMessage ?? data.systemPrompt, context).trim() ||
    DEFAULT_SYSTEM_MESSAGE;

  // Structured Output Parser: the final answer has to be JSON in the shape
  // of the example (or JSON Schema) given on the parser node
  const outputFormat = parserNode
    ? renderTemplate(
        (parserNode.data as { jsonExample?: string } | null)?.jsonExample,
        context
      ).trim()
    : "";

  if (parserNode && !outputFormat) {
    throw new NonRetriableError(
      "AI Agent: the connected Structured Output Parser has no JSON example"
    );
  }

  const instructions = parserNode
    ? `${baseSystem}\n\nIMPORTANT: Your final answer must be a single JSON value and nothing else: no explanation, no markdown fences. It must have exactly this structure:\n${outputFormat}`
    : baseSystem;

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

  // Postgres Memory: a message limit, an optional summary of what is older,
  // and long-term facts about the contact
  const postgresMemory =
    memoryNode?.type === NodeType.POSTGRES_MEMORY
      ? {
          nodeId: memoryNode.id,
          limit: resolveMessageLimit(renderTemplate(String(memoryData.messageLimit ?? ""), context)),
          summarize: memoryData.summarize === "true",
          // Facts belong to a contact; by default that is the session
          contactId:
            memoryData.facts === "false"
              ? null
              : normalizeContactId(
                  renderTemplate(memoryData.contactId || "", context).trim() || sessionId
                ),
        }
      : null;

  let memorySummary: string | null = null;
  let knownFacts: ContactFactEntry[] = [];

  if (postgresMemory) {
    const loaded = await step.run("retrieve-postgres-memory", async () => {
      const session = await loadSessionMemory({
        nodeId: postgresMemory.nodeId,
        userId,
        sessionId,
        limit: postgresMemory.limit,
        summarize: postgresMemory.summarize,
      });

      return {
        ...session,
        facts: postgresMemory.contactId
          ? await listContactFacts(userId, postgresMemory.contactId)
          : [],
      };
    });

    history = loaded.messages;
    memorySummary = loaded.summary;
    knownFacts = loaded.facts;
  } else if (memoryNode) {
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
  const inlineStep = createInlineStep(step);

  // "Require approval": the model can call the tool, but the call only runs
  // after a person approved it (see the loop in section 6)
  const approvalDefaultByRisk =
    data.toolApprovalDefault === TOOL_APPROVAL_DEFAULT_BY_RISK;

  const needsApproval = (toolNode: NodeWithCredential) =>
    toolRequiresApproval({
      saved: data.toolSettings?.[toolNode.id]?.requireApproval,
      risk: getToolRisk(
        toolNode.type,
        (toolNode.data ?? {}) as Record<string, unknown>
      ),
      defaultByRisk: approvalDefaultByRisk,
    });

  const approvalDelivery: ApprovalDelivery = {
    channel: data.approvalChannel,
    credentialId: data.approvalCredentialId,
    recipient: data.approvalRecipient,
    webhookUrl: data.approvalWebhookUrl,
    phoneNumberId: data.approvalPhoneNumberId,
  };

  if (toolNodes.some(needsApproval)) {
    // Before the model is called: a run must not get as far as a tool call
    // and then find it has nowhere to send the request
    const problem = getDeliveryProblem(approvalDelivery, context);

    if (problem) {
      throw new NonRetriableError(
        `AI Agent: a tool requires approval, but ${problem}. Check "Send approval requests through" in the AI Agent's settings.`
      );
    }
  }

  const tools: ToolSet = {};
  const takenNames = new Set<string>();
  // The tools that wait for approval, by the name the model calls them
  const approvalRunners = new Map<
    string,
    (input: Record<string, unknown>) => Promise<unknown>
  >();

  // MCP servers bring their own tools; they are connected inside the
  // agent's step below because the connection is live
  const mcpNodes = toolNodes.filter(
    (node) => node.type === NodeType.MCP_CLIENT_TOOL
  );

  const mcpServers: {
    data: McpClientData;
    secret: string;
    requireApproval: boolean;
  }[] = [];
  for (const mcpNode of mcpNodes) {
    const mcpData = (mcpNode.data ?? {}) as McpClientData;

    mcpServers.push({
      data: mcpData,
      secret: await loadMcpSecret({
        step,
        userId,
        nodeId: mcpNode.id,
        data: mcpData,
      }),
      requireApproval: needsApproval(mcpNode),
    });
  }

  for (const toolNode of toolNodes) {
    if (toolNode.type === NodeType.MCP_CLIENT_TOOL) continue;

    const executor = executorRegistry[toolNode.type as NodeType];
    if (!executor) continue;

    const toolData = (toolNode.data ?? {}) as Record<string, unknown>;
    const settings = data.toolSettings?.[toolNode.id] ?? {};

    const name = uniqueToolName(
      sanitizeToolName(settings.name || "") ||
        getDefaultToolName(toolNode.type, toolData),
      takenNames
    );

    const runTool = async (input: Record<string, unknown>) => {
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
          executionId,
          workflowId,
          callDepth,
          // An AI Agent Tool counts how deep agents call agents
          agentDepth: (agentDepth ?? 0) + 1,
          inline: true,
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
    };

    const definition = {
      description:
        settings.description?.trim() ||
        getDefaultToolDescription(toolNode.type, toolData),
      inputSchema: buildToolInputSchema(getToolParameters(toolNode.type, toolData)),
    };

    if (needsApproval(toolNode)) {
      // Without `execute` the loop stops when the model calls the tool
      tools[name] = tool(definition);
      approvalRunners.set(name, runTool);
    } else {
      tools[name] = tool({ ...definition, execute: runTool });
    }
  }

  // Postgres Memory: the two tools that read and change the contact's facts.
  // They only touch the agent's own notes, so they never ask for approval.
  const factTools = postgresMemory?.contactId
    ? buildFactTools({ userId, contactId: postgresMemory.contactId, takenNames })
    : null;

  if (factTools) Object.assign(tools, factTools.tools);

  const memoryNote = buildMemoryNote({
    summary: memorySummary,
    facts: knownFacts,
    factTools: factTools?.names ?? null,
  });

  const system = memoryNote ? `${instructions}\n\n${memoryNote}` : instructions;

  const nodeToolNames = [...takenNames];

  // Connects to the MCP servers and returns their tools under the same
  // names every time, with the tools of servers that require approval listed
  const loadMcpTools = async () => {
    const names = new Set(nodeToolNames);
    const all: ToolSet = {};
    const approval = new Set<string>();

    for (const server of mcpServers) {
      try {
        const serverTools = await buildMcpTools({
          data: server.data,
          secret: server.secret,
          context,
          takenNames: names,
        });

        for (const [name, serverTool] of Object.entries(serverTools)) {
          all[name] = serverTool;
          if (server.requireApproval) approval.add(name);
        }
      } catch (error: any) {
        throw new NonRetriableError(
          `AI Agent: could not load the tools of the MCP server (${error?.message || "unknown error"})`
        );
      }
    }

    return { all, approval };
  };

  // =========================================================================
  // 6. RUN THE AGENT
  // =========================================================================
  // The model loop runs in a step. When the model calls a tool that requires
  // approval the step ends there; the request is sent and the run waits (an
  // Inngest wait-for-event, like the Wait node), the tool is run or not, and
  // the loop goes on in a new step with the tool's result.
  const add = (a?: number, b?: number) =>
    a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);

  const addUsage = (
    a: AgentLoopResult["usage"],
    b: AgentLoopResult["usage"]
  ): AgentLoopResult["usage"] => ({
    inputTokens: add(a.inputTokens, b.inputTokens),
    outputTokens: add(a.outputTokens, b.outputTokens),
    totalTokens: add(a.totalTokens, b.totalTokens),
    cachedInputTokens: add(a.cachedInputTokens, b.cachedInputTokens),
  });

  let conversation = messages;
  let iterationsLeft = maxIterations;
  let toolCallsLeft = maxToolCalls;

  const intermediateSteps: IntermediateStep[] = [];
  const modelAttempts: unknown[] = [];
  let usage: AgentLoopResult["usage"] = {};
  let answerText = "";
  let answeredBy: {
    modelUsed?: string;
    providerUsed?: string;
    fallbackUsed?: boolean;
    modelRoute?: { tier: "cheap" | "strong"; reason: string };
  } = {};

  for (let segment = 1; ; segment++) {
    const segmentMessages = conversation;
    const segmentIterations = iterationsLeft;
    const segmentToolCalls = toolCallsLeft;
    // What the tools returned before this part of the loop
    const earlierSteps = [...intermediateSteps];

    const part = await step.run(
      // The first keeps the name it always had, for runs in flight
      segment === 1
        ? "execute-agent-llm-loop"
        : `execute-agent-llm-loop-${segment}`,
      async () => {
        // Which model answered each call of the loop
        const tracker = createModelTracker();

        try {
          const { model } = createFallbackModel(candidates, tracker);

          const mcp = await loadMcpTools();
          const allTools: ToolSet = { ...tools };

          for (const [name, mcpTool] of Object.entries(mcp.all)) {
            if (mcp.approval.has(name)) {
              const { execute: _execute, ...definition } = mcpTool as ToolSet[string] & {
                execute?: unknown;
              };
              allTools[name] = definition as ToolSet[string];
            } else {
              allTools[name] = mcpTool;
            }
          }

          let result = await runAgentLoop({
            model,
            system,
            messages: segmentMessages,
            tools: allTools,
            maxIterations: segmentIterations,
            maxToolCalls: segmentToolCalls,
          });

          // Model Router: which side gave the final answer, and why
          let modelRoute: { tier: "cheap" | "strong"; reason: string } | undefined;

          if (routerNode && result.pending.length === 0) {
            const strongAnswered =
              tracker.calls[tracker.calls.length - 1]?.tier === STRONG_TIER;

            modelRoute = strongAnswered
              ? { tier: "strong", reason: "The cheap model failed or timed out" }
              : { tier: "cheap", reason: "The cheap model answered" };

            const escalateOnParser =
              (routerNode.data as { escalateOnParser?: string } | null)
                ?.escalateOnParser !== "false";

            // The cheap model's answer does not fit the parser: the strong model
            // answers instead. The tools are not run again; it is given what
            // they returned.
            if (
              parserNode &&
              escalateOnParser &&
              !strongAnswered &&
              extractJson(result.output) === undefined
            ) {
              const strong = createFallbackModel(
                candidates.filter((candidate) => candidate.tier === STRONG_TIER),
                tracker
              );

              // What the tools returned, also before a pause for approval
              const toolSteps = [...earlierSteps, ...result.intermediateSteps];

              const second = await runAgentLoop({
                model: strong.model,
                system,
                messages: [
                  ...history,
                  {
                    role: "user",
                    content: buildEscalationPrompt({
                      prompt,
                      draft: result.output,
                      toolResults: toolSteps.map((entry) => ({
                        tool: entry.action.tool,
                        input: entry.action.toolInput,
                        result: entry.observation,
                      })),
                    }),
                  },
                ],
                tools: {},
              });

              result = {
                ...result,
                output: second.output,
                iterations: result.iterations + second.iterations,
                usage: addUsage(result.usage, second.usage),
              };

              modelRoute = {
                tier: "strong",
                reason: "The cheap model's answer did not fit the Structured Output Parser",
              };
            }
          }

          return { ...result, ...describeModelAnswer(tracker), modelRoute };
        } catch (error: any) {
          if (error instanceof NonRetriableError) throw error;

          if (error instanceof AgentToolCallLimitError) {
            // The limit is the agent's, not what was left of it for this part
            throw new NonRetriableError(
              new AgentToolCallLimitError(maxToolCalls).message
            );
          }

          console.error(`[AI Agent Error]: Failed to communicate with ${provider}`, error);

          // Stop immediately and mark the AI Agent node as FAILED
          throw new NonRetriableError(
            `LLM Provider Error (${provider}): ${error.message || "Failed to generate response."}`
          );
        } finally {
          // One line per model that answered, also when the run then failed:
          // the calls that were answered have been paid for
          await recordModelCalls(
            getAiUsageScope({ userId, workflowId, executionId, nodeId, allNodes }),
            tracker
          );
        }
      }
    );

    intermediateSteps.push(...(part.intermediateSteps as IntermediateStep[]));
    modelAttempts.push(...(part.modelAttempts ?? []));
    usage = addUsage(usage, part.usage);
    answerText = part.output;
    answeredBy = {
      modelUsed: part.modelUsed,
      providerUsed: part.providerUsed,
      fallbackUsed: answeredBy.fallbackUsed === true || part.fallbackUsed === true,
      modelRoute: part.modelRoute ?? undefined,
    };

    // A run that was in flight when this was deployed has no `pending`
    const pending = part.pending ?? [];
    if (pending.length === 0) break;

    toolCallsLeft -= (part.toolCalls ?? 0) + pending.length;
    iterationsLeft -= part.iterations;

    if (toolCallsLeft < 0) {
      throw new NonRetriableError(new AgentToolCallLimitError(maxToolCalls).message);
    }

    let timeoutMs: number;
    try {
      timeoutMs = parseWaitDuration(
        renderTemplate(String(data.approvalTimeoutAmount ?? ""), context).trim() ||
          APPROVAL_DEFAULT_TIMEOUT_AMOUNT,
        data.approvalTimeoutUnit || APPROVAL_DEFAULT_TIMEOUT_UNIT,
        "Approval Timeout"
      );
    } catch (error) {
      throw new NonRetriableError(
        (error instanceof Error ? error.message : "Approval Timeout is not valid").replace(
          /^Wait node:/,
          "AI Agent:"
        )
      );
    }

    const results: { toolCallId: string; toolName: string; result: unknown }[] = [];

    // One request at a time, in the order the model asked
    for (const call of pending) {
      const approval = await requestApproval({
        step,
        stepId: `agent-approval-${call.toolCallId}`,
        label: "AI Agent",
        executionId,
        nodeId,
        userId,
        kind: "tool",
        title: call.toolName,
        details: call.input,
        delivery: approvalDelivery,
        timeoutMs,
        context,
      });

      const input = (call.input ?? {}) as Record<string, unknown>;

      const result =
        approval.outcome === "approved"
          ? await step.run(`agent-tool-${call.toolCallId}`, async () => {
              const runner = approvalRunners.get(call.toolName);
              if (runner) return runner(input);

              // An MCP server's tool: the connection is made again
              const mcpTool = (await loadMcpTools()).all[call.toolName] as
                | { execute?: (input: unknown, options: unknown) => unknown }
                | undefined;

              return mcpTool?.execute
                ? mcpTool.execute(input, { toolCallId: call.toolCallId, messages: [] })
                : { error: "The tool is no longer available" };
            })
          : approval.outcome === "rejected"
            ? TOOL_REJECTED_MESSAGE
            : TOOL_EXPIRED_MESSAGE;

      results.push({
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        result,
      });

      intermediateSteps.push({
        action: {
          tool: call.toolName,
          toolInput: call.input,
          toolCallId: call.toolCallId,
        },
        observation: result ?? null,
      });
    }

    conversation = appendToolResults(
      [
        ...segmentMessages,
        ...(part.responseMessages as unknown as ModelMessage[]),
      ],
      results
    );

    if (iterationsLeft <= 0) {
      answerText = AGENT_MAX_ITERATIONS_MESSAGE;
      break;
    }
  }

  const agentResult = {
    output: answerText,
    intermediateSteps,
    usage,
    modelAttempts,
    ...answeredBy,
  };

  // With an output parser the answer is data, not text
  let finalOutput: unknown = agentResult.output;

  if (parserNode) {
    finalOutput = extractJson(agentResult.output);

    if (finalOutput === undefined) {
      throw new NonRetriableError(
        "AI Agent: the model's answer does not fit the required output format. Answer was: " +
          agentResult.output.slice(0, 300)
      );
    }
  }

  // =========================================================================
  // 7. SAVE THIS TURN TO MEMORY
  // =========================================================================
  if (postgresMemory) {
    await step.run("persist-postgres-memory", async () => {
      await saveSessionTurn({
        nodeId: postgresMemory.nodeId,
        userId,
        sessionId,
        userMessage: prompt,
        assistantMessage: agentResult.output,
      });
    });

    if (postgresMemory.summarize) {
      // The answer is already made: a summary that cannot be written is
      // tried again after a later turn, and never fails the run
      await step.run("summarize-postgres-memory", async () => {
        const session = { nodeId: postgresMemory.nodeId, userId, sessionId };
        const tracker = createModelTracker();

        try {
          const batch = await findMessagesToSummarize({ ...session, limit: postgresMemory.limit });
          if (!batch) return { summarized: 0 };

          const summary = await runAgentLoop({
            model: createFallbackModel(candidates, tracker).model,
            system: SUMMARY_SYSTEM,
            messages: [{ role: "user", content: buildSummaryPrompt(batch.previous, batch.messages) }],
            tools: {},
          });

          if (!summary.output.trim()) return { summarized: 0 };

          await saveSessionSummary({ ...session, summary: summary.output, until: batch.until });

          return { summarized: batch.messages.length };
        } catch {
          return { summarized: 0 };
        } finally {
          await recordModelCalls(
            getAiUsageScope({ userId, workflowId, executionId, nodeId, allNodes }),
            tracker
          );
        }
      });
    }
  } else if (memoryNode) {
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
    output: finalOutput,
    // Kept for workflows that referenced {{aiAgentOutput.response}}
    response: agentResult.output,
    ...(data.returnIntermediateSteps
      ? { intermediateSteps: agentResult.intermediateSteps }
      : {}),
    usage: agentResult.usage,
    // The model that gave the final answer: with fallbacks or a Model Router
    // it is not always the first one
    modelUsed: agentResult.modelUsed ?? modelName,
    providerUsed: agentResult.providerUsed ?? specs[0].usageProvider,
    fallbackUsed: agentResult.fallbackUsed === true,
    modelAttempts: agentResult.modelAttempts ?? [],
    ...(agentResult.modelRoute ? { modelRoute: agentResult.modelRoute } : {}),
  };

  return {
    ...context,
    [targetOutputKey]: agentOutput,
    // n8n exposes the answer as `output`
    output: finalOutput,
  };
};
