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
  type ChatModelData,
} from "../components/chat-model/executor";

// "COMPATIBLE" is the Chat Model node: OpenRouter, Groq, Ollama and so on
export type ModelProvider = "OPENAI" | "ANTHROPIC" | "GEMINI" | "COMPATIBLE";

// Node types that can be plugged into a Chat Model port
export const MODEL_NODE_PROVIDERS: Record<string, ModelProvider> = {
  OPENAI: "OPENAI",
  ANTHROPIC: "ANTHROPIC",
  GEMINI: "GEMINI",
  CHAT_MODEL: "COMPATIBLE",
};

// Same defaults the standalone model nodes use
export const DEFAULT_MODELS: Record<ModelProvider, string> = {
  OPENAI: "gpt-4o-mini",
  ANTHROPIC: "claude-sonnet-5-5",
  GEMINI: "gemini-2.5-flash",
  // The Chat Model node always names its model
  COMPATIBLE: "",
};

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

/**
 * Resolves the chat model connected to a node's Chat Model port. The
 * credential row is fetched in a step; `create()` decrypts the key, so call
 * it inside the step that talks to the model.
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
      `${label} node: connect a chat model (OpenAI, Anthropic, Gemini or Chat Model) to its Model port`
    );
  }

  const provider = MODEL_NODE_PROVIDERS[modelNode.type as NodeType];
  const modelData = (modelNode.data ?? {}) as Record<string, any>;

  const modelName: string =
    modelData.model?.trim() || modelData.modelName?.trim() || DEFAULT_MODELS[provider];

  if (!modelName) {
    throw new NonRetriableError(
      `${label} node: the connected Chat Model node has no model set`
    );
  }

  const credentialId: string | undefined =
    modelData.credentialId || modelNode.credentialId || undefined;

  if (!credentialId) {
    throw new NonRetriableError(
      `${label} node: the connected model node has no credential selected`
    );
  }

  const credential = await step.run(`${nodeId}-get-model-credential`, async () => {
    // Scoped to the workflow owner: never use another user's credential
    return prisma.credential.findUnique({
      where: { id: credentialId, userId },
    });
  });

  if (!credential) {
    throw new NonRetriableError(`${label} node: model credential not found`);
  }

  return {
    provider,
    modelName,
    create: () =>
      buildLanguageModel(
        provider,
        decrypt(credential.value).trim(),
        modelName,
        modelData
      ),
  };
};
