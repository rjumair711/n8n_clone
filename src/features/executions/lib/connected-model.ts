import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { NodeType } from "@prisma/client";
import type { LanguageModel } from "ai";
import { NonRetriableError } from "inngest";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import type { Connection } from "@prisma/client";
import type { NodeWithCredential, StepTools } from "../types";
import {
  createCompatibleChatModel,
  getChatModelUsageProvider,
  type ChatModelData,
} from "../components/chat-model/model";
import { withDedicatedProvider } from "./chat-model-providers";
import {
  CHEAP_TIER,
  DEFAULT_ROUTER_TIMEOUT_SECONDS,
  ROUTER_CHEAP_PORT,
  ROUTER_STRONG_PORT,
  STRONG_TIER,
  createFallbackModel,
  parseFallbackModels,
  parseTimeoutMs,
  type LanguageModelV3,
  type ModelCandidate,
} from "./model-fallback";

// "COMPATIBLE" is the Chat Model node (OpenRouter, Groq, Ollama and so on)
// and the DeepSeek, Kimi and Qwen nodes built on it
export type ModelProvider = "OPENAI" | "ANTHROPIC" | "GEMINI" | "COMPATIBLE";

// Node types that can be plugged into a Chat Model port
export const MODEL_NODE_PROVIDERS: Record<string, ModelProvider> = {
  OPENAI: "OPENAI",
  ANTHROPIC: "ANTHROPIC",
  GEMINI: "GEMINI",
  CHAT_MODEL: "COMPATIBLE",
  DEEPSEEK: "COMPATIBLE",
  KIMI: "COMPATIBLE",
  QWEN: "COMPATIBLE",
};

// Plugged into an AI Agent's Chat Model port in place of a model node
export const MODEL_ROUTER_TYPE = "MODEL_ROUTER";

// A model node as it is saved, or the type and settings of one that is running
type ModelNode = {
  type: string;
  data?: unknown;
  credentialId?: string | null;
};

// A model node's settings, with the provider of a DeepSeek, Kimi or Qwen
// node filled in
export const getModelNodeData = (
  modelNode?: Pick<ModelNode, "type" | "data">
): Record<string, any> =>
  modelNode
    ? withDedicatedProvider(
        modelNode.type,
        (modelNode.data ?? {}) as Record<string, any>
      )
    : {};

// Same defaults the standalone model nodes use
export const DEFAULT_MODELS: Record<ModelProvider, string> = {
  OPENAI: "gpt-4o-mini",
  ANTHROPIC: "claude-sonnet-5-5",
  GEMINI: "gemini-2.5-flash",
  // The Chat Model node always names its model
  COMPATIBLE: "",
};

// The provider a model's calls are recorded and priced under: "openai",
// "anthropic", "gemini", a Chat Model preset or "custom"
export const getUsageProvider = (
  provider: ModelProvider,
  modelData: Record<string, unknown> = {}
) =>
  provider === "COMPATIBLE"
    ? getChatModelUsageProvider(modelData as ChatModelData)
    : provider.toLowerCase();

export const buildLanguageModel = (
  provider: ModelProvider,
  apiKey: string,
  modelName: string,
  modelData: Record<string, unknown> = {}
): LanguageModel => {
  switch (provider) {
    case "OPENAI":
      return createOpenAI({ apiKey })(modelName);
    case "ANTHROPIC":
      return createAnthropic({ apiKey })(modelName);
    case "GEMINI":
      return createGoogleGenerativeAI({ apiKey })(modelName);
    case "COMPATIBLE":
      return createCompatibleChatModel(modelData as ChatModelData, apiKey);
  }
};

/**
 * The nodes plugged into one of a node's sub-ports ("sub-model",
 * "sub-memory", "sub-tools", "sub-parser").
 */
export const findSubNodes = ({
  nodeId,
  port,
  allNodes,
  connections,
}: {
  nodeId: string;
  port: string;
  allNodes: NodeWithCredential[];
  connections: Connection[];
}): NodeWithCredential[] =>
  connections
    .filter((edge) => edge.toNodeId === nodeId && edge.toInput === port)
    .flatMap((edge) => {
      const source = allNodes.find((node) => node.id === edge.fromNodeId);
      return source ? [source] : [];
    });

// One model to try: what is needed to build it, apart from the API key
export type ModelSpec = {
  provider: ModelProvider;
  usageProvider: string;
  modelName: string;
  modelData: Record<string, unknown>;
  credentialId?: string;
  // The Model Router's cheap or strong side; cheap for everything else
  tier: number;
  timeoutMs?: number;
};

/**
 * The models a model node stands for, in the order they are tried: the
 * node's own model, then the Chat Model node's "Fallback models". A
 * fallback without a provider or credential of its own uses the node's.
 */
export const getModelNodeSpecs = (
  modelNode: ModelNode,
  tier: number = CHEAP_TIER
): ModelSpec[] => {
  const provider = MODEL_NODE_PROVIDERS[modelNode.type];
  const modelData = getModelNodeData(modelNode);

  const credentialId: string | undefined =
    modelData.credentialId || modelNode.credentialId || undefined;

  const primary: ModelSpec = {
    provider,
    usageProvider: getUsageProvider(provider, modelData),
    modelName:
      modelData.model?.trim() || modelData.modelName?.trim() || DEFAULT_MODELS[provider],
    modelData,
    credentialId,
    tier,
  };

  const fallbacks =
    modelNode.type === NodeType.CHAT_MODEL
      ? parseFallbackModels(modelData.fallbackModels)
      : [];

  if (fallbacks.length === 0) return [primary];

  const timeoutMs = parseTimeoutMs(modelData.fallbackTimeoutSeconds);

  return [
    { ...primary, timeoutMs },
    ...fallbacks.map((entry): ModelSpec => {
      const data = {
        ...modelData,
        model: entry.model,
        // Another provider has its own address
        ...(entry.provider ? { provider: entry.provider, baseUrl: "" } : {}),
      };

      return {
        provider,
        usageProvider: getUsageProvider(provider, data),
        modelName: entry.model,
        modelData: data,
        credentialId: entry.credentialId || credentialId,
        tier,
        timeoutMs,
      };
    }),
  ];
};

/**
 * The models of a Model Router: what is plugged into its Cheap port first,
 * then what is plugged into its Strong port. Each side brings its own
 * fallbacks.
 */
export const getRouterSpecs = ({
  label,
  routerNode,
  allNodes,
  connections,
}: {
  label: string;
  routerNode: Pick<NodeWithCredential, "id" | "data">;
  allNodes: NodeWithCredential[];
  connections: Connection[];
}): ModelSpec[] => {
  const plugged = (port: string) =>
    findSubNodes({ nodeId: routerNode.id, port, allNodes, connections }).find(
      (node) => node.type in MODEL_NODE_PROVIDERS
    );

  const cheap = plugged(ROUTER_CHEAP_PORT);
  const strong = plugged(ROUTER_STRONG_PORT);

  if (!cheap || !strong) {
    throw new NonRetriableError(
      `${label}: the Model Router needs a model node on its Cheap port and another on its Strong port`
    );
  }

  const timeoutMs = parseTimeoutMs(
    (routerNode.data as { timeoutSeconds?: unknown } | null)?.timeoutSeconds,
    DEFAULT_ROUTER_TIMEOUT_SECONDS
  );

  return [
    // The cheap side always has the strong one to hand over to
    ...getModelNodeSpecs(cheap, CHEAP_TIER).map((spec) => ({
      ...spec,
      timeoutMs: spec.timeoutMs ?? timeoutMs,
    })),
    ...getModelNodeSpecs(strong, STRONG_TIER),
  ];
};

/**
 * Loads the credentials of the models to try and returns them ready to be
 * built. The credential rows are fetched in steps; each key is decrypted
 * only when its model is first needed, so call `create()` (or
 * createFallbackModel) inside the step that talks to the model.
 *
 * `stepId` fetches the first model's credential; the others, when there
 * are any, come from `<stepId>-fallbacks`.
 */
export const loadModelCandidates = async ({
  label,
  stepId,
  specs,
  userId,
  step,
}: {
  label: string;
  stepId: string;
  specs: ModelSpec[];
  userId: string;
  step: StepTools;
}): Promise<ModelCandidate[]> => {
  for (const spec of specs) {
    if (!spec.modelName) {
      throw new NonRetriableError(`${label}: the Chat Model node has no model set`);
    }
    if (!spec.credentialId) {
      throw new NonRetriableError(`${label}: Credential is required`);
    }
  }

  const [primary, ...others] = specs;
  const primaryId = primary.credentialId as string;

  const credential = await step.run(stepId, async () => {
    // Scoped to the workflow owner: never use another user's credential
    return prisma.credential.findUnique({
      where: { id: primaryId, userId },
    });
  });

  if (!credential) {
    throw new NonRetriableError(`${label}: Credential not found`);
  }

  // Still encrypted, by credential id
  const values = new Map<string, string>([[primaryId, credential.value]]);

  const otherIds = [
    ...new Set(others.map((spec) => spec.credentialId as string)),
  ].filter((id) => id !== primaryId);

  if (otherIds.length > 0) {
    const rows = await step.run(`${stepId}-fallbacks`, async () => {
      return prisma.credential.findMany({
        where: { id: { in: otherIds }, userId },
        select: { id: true, value: true },
      });
    });

    for (const row of rows) values.set(row.id, row.value);

    if (otherIds.some((id) => !values.has(id))) {
      throw new NonRetriableError(
        `${label}: the credential of one of the other models was not found`
      );
    }
  }

  return specs.map((spec) => ({
    provider: spec.usageProvider,
    model: spec.modelName,
    tier: spec.tier,
    timeoutMs: spec.timeoutMs,
    create: () =>
      buildLanguageModel(
        spec.provider,
        decrypt(values.get(spec.credentialId as string) as string).trim(),
        spec.modelName,
        spec.modelData
      ) as LanguageModelV3,
  }));
};

/**
 * Resolves the chat model connected to a node's Chat Model port. `create()`
 * decrypts the key, so call it inside the step that talks to the model. It
 * returns the model and a tracker that says which model answered.
 */
export const loadConnectedModel = async ({
  label,
  nodeId,
  userId,
  allNodes,
  connections,
  step,
}: {
  label: string;
  nodeId: string;
  userId: string;
  allNodes: NodeWithCredential[];
  connections: Connection[];
  step: StepTools;
}) => {
  const modelNode = findSubNodes({
    nodeId,
    port: "sub-model",
    allNodes,
    connections,
  }).find((node) => node.type in MODEL_NODE_PROVIDERS);

  if (!modelNode) {
    throw new NonRetriableError(
      `${label} node: connect a chat model (OpenAI, Anthropic, Gemini, DeepSeek, Kimi, Qwen or Chat Model) to its Model port`
    );
  }

  const specs = getModelNodeSpecs(modelNode);

  if (!specs[0].modelName) {
    throw new NonRetriableError(
      `${label} node: the connected Chat Model node has no model set`
    );
  }

  if (!specs[0].credentialId) {
    throw new NonRetriableError(
      `${label} node: the connected model node has no credential selected`
    );
  }

  const candidates = await loadModelCandidates({
    label: `${label} node`,
    stepId: `${nodeId}-get-model-credential`,
    specs,
    userId,
    step,
  });

  return {
    provider: specs[0].provider,
    usageProvider: specs[0].usageProvider,
    modelName: specs[0].modelName,
    create: () => createFallbackModel(candidates),
  };
};
