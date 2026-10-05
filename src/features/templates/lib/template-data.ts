// Turning a workflow into a template and back. Pure functions, so the rules
// about what a template may contain can be tested without a database.

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
// author's account has. They never go into a template.
const PRIVATE_KEYS = new Set([
  // Which stored credential a node uses
  "credentialId",
  // Webhook, Typeform and Google Form secrets; the Stripe signing secret
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

const PLAN_ORDER = ["FREE", "BEGINNER", "INTERMEDIATE", "PRO"];

export const PLAN_NAMES: Record<string, string> = {
  FREE: "Free",
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  PRO: "Pro",
};

/**
 * Whether a user may use a template. An active free trial opens every
 * template, the same way it opens plan-locked nodes, so new users can try
 * what the paid plans offer.
 */
export const canUseTemplate = (
  minPlan: string,
  userPlan: string,
  trialEndsAt?: Date | string | null
) =>
  PLAN_ORDER.indexOf(userPlan) >= PLAN_ORDER.indexOf(minPlan) ||
  (!!trialEndsAt && new Date(trialEndsAt) > new Date());

/**
 * Admins are listed in ADMIN_EMAILS (comma-separated). Only they can
 * publish, edit and delete templates.
 */
export const isAdminEmail = (email: string | null | undefined) => {
  if (!email) return false;

  const admins = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  return admins.includes(email.trim().toLowerCase());
};
