// Turning a workflow into a template and back. Pure functions, so the rules
// about what a template may contain can be tested without a database.

import {
  PLAN_ORDER,
  getMinPlanForNodes,
  trialUnlocksNodes,
  type PlanName,
} from "@/config/plans";

export type TemplateNode = {
  id: string;
  type: string;
  position: unknown;
  data: Record<string, unknown>;
};

export type TemplateConnection = {
  fromNodeId: string;
  toNodeId: string;
  fromOutput: string;
  toInput: string;
};

// Node settings that are secrets, or that point at something only the
// author's account has. They never go into a template, and "Build with AI"
// never sends them to a model (see ai-builder/lib/private-keys.ts).
export const PRIVATE_KEYS = new Set([
  // Which stored credential a node uses
  "credentialId",
  // A node's second credential: the Vector Store's reranker, the Document
  // Loader's embeddings
  "rerankCredentialId",
  "embeddingCredentialId",
  // Webhook, Typeform, WooCommerce and Google Form secrets; the Stripe and
  // Shopify signing secrets
  "secret",
  "signingSecret",
  // WhatsApp Trigger
  "verifyToken",
  "appSecret",
  // Slack and Discord incoming-webhook URLs let anyone post to the channel
  "webhookUrl",
  // Execute Workflow: the author's own workflow
  "workflowId",
]);

const clean = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(clean);

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !PRIVATE_KEYS.has(key))
        .map(([key, inner]) => [key, clean(inner)])
    );
  }

  return value;
};

/**
 * What is stored when a workflow is saved as a template: its nodes and
 * connections without credentials, secrets, or the empty start node.
 */
export const toTemplateData = (
  nodes: { id: string; type: string; position: unknown; data: unknown }[],
  connections: TemplateConnection[]
) => {
  const kept = nodes.filter((node) => node.type !== "INITIAL");
  const ids = new Set(kept.map((node) => node.id));

  return {
    nodes: kept.map(
      (node): TemplateNode => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: clean(node.data ?? {}) as Record<string, unknown>,
      })
    ),
    connections: connections
      .filter((conn) => ids.has(conn.fromNodeId) && ids.has(conn.toNodeId))
      .map(({ fromNodeId, toNodeId, fromOutput, toInput }) => ({
        fromNodeId,
        toNodeId,
        fromOutput,
        toInput,
      })),
    nodeTypes: [...new Set(kept.map((node) => node.type))],
  };
};

/**
 * A fresh copy of a template for one user: every node gets a new id, and
 * everything that refers to a node id follows.
 */
export const instantiateTemplate = (
  nodes: TemplateNode[],
  connections: TemplateConnection[],
  createId: () => string
) => {
  const idMap = new Map(nodes.map((node) => [node.id, createId()]));

  return {
    nodes: nodes.map((node) => {
      const data = { ...node.data };

      // The AI Agent keeps each tool's name and description by node id
      if (data.toolSettings && typeof data.toolSettings === "object") {
        data.toolSettings = Object.fromEntries(
          Object.entries(data.toolSettings as Record<string, unknown>).flatMap(
            ([nodeId, settings]) =>
              idMap.has(nodeId) ? [[idMap.get(nodeId)!, settings]] : []
          )
        );
      }

      return {
        id: idMap.get(node.id)!,
        type: node.type,
        position: node.position,
        data,
      };
    }),
    connections: connections.flatMap((conn) => {
      const fromNodeId = idMap.get(conn.fromNodeId);
      const toNodeId = idMap.get(conn.toNodeId);

      return fromNodeId && toNodeId
        ? [{ fromNodeId, toNodeId, fromOutput: conn.fromOutput, toInput: conn.toInput }]
        : [];
    }),
  };
};

export const PLAN_NAMES: Record<string, string> = {
  FREE: "Free",
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  PRO: "Pro",
};

const planIndex = (plan: string) => (PLAN_ORDER as readonly string[]).indexOf(plan);

/**
 * The plan a template needs: the one its admin picked, or the cheapest plan
 * that can run all of its nodes if that is higher. A template saved as
 * "Free" with a WhatsApp node is a Pro template.
 */
export const getTemplateMinPlan = (minPlan: string, nodeTypes: Iterable<string>): PlanName => {
  const needed = getMinPlanForNodes(nodeTypes);

  return planIndex(minPlan) > planIndex(needed) ? (minPlan as PlanName) : needed;
};

/**
 * Whether a user may use a template. An active free trial opens it, the
 * same way it opens plan-locked nodes, unless one of its nodes is one the
 * trial does not unlock (SSH).
 */
export const canUseTemplate = (
  template: { minPlan: string; nodeTypes: readonly string[] },
  userPlan: string,
  trialEndsAt?: Date | string | null
) =>
  planIndex(userPlan) >= planIndex(getTemplateMinPlan(template.minPlan, template.nodeTypes)) ||
  (!!trialEndsAt &&
    new Date(trialEndsAt) > new Date() &&
    trialUnlocksNodes(template.nodeTypes));

// Where the setup part of a description starts, in the languages templates
// are written in
const SETUP_MARKER = /(?:^|\s)(?:to set it up|set ?up(?: steps)?|سیٹ اپ|الإعداد)\s*:\s*/i;
// "1. Pick a credential 2. ...": a list numbered from 1
const NUMBERED = /^1[.)]\s+/;

const tidyStep = (step: string) => {
  const text = step.trim().replace(/[;؛]$/, "").trim();
  // "choose your Google credential" after a semicolon starts a step
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
};

/**
 * A template's description as the gallery shows it: what it does (the card
 * shows the start of it), and the setup steps as a list. Templates keep one
 * description field; the steps are whatever follows "Set up:" (or "To set
 * it up:"), one per line, numbered, or one per sentence or semicolon.
 */
export const splitTemplateDescription = (description: string) => {
  const match = SETUP_MARKER.exec(description);

  if (!match) return { summary: description.trim(), steps: [] as string[] };

  const summary = description.slice(0, match.index).trim();
  const rest = description.slice(match.index + match[0].length).trim();

  const parts = rest.includes("\n")
    ? rest.split(/\n+/).map((line) => line.replace(/^\s*(?:\d+[.)]|[-*•])\s+/, ""))
    : NUMBERED.test(rest)
      ? rest.split(/(?:^|\s+)\d{1,2}[.)]\s+/)
      : // After a sentence end or a semicolon. Dots inside "{{a.b}}" or
        // "1.5" have no space after them and are not split on.
        rest.split(/(?<=[.;؛۔])\s+/);

  return { summary, steps: parts.map(tidyStep).filter(Boolean) };
};
