// Duplicate workflow: a copy in the same account. Unlike an export, nothing
// is left out: the copy keeps its credentials and secrets, because it stays
// with the same owner. Pure, so it can be tested without a database.

import { instantiateTemplate } from "@/features/templates/lib/template-data";

export const MAX_WORKFLOW_NAME = 200;

/** "Orders" -> "Orders (copy)", "Orders (copy)" -> "Orders (copy 2)" */
export const copyName = (name: string): string => {
  const match = /^(.*) \(copy(?: (\d+))?\)$/.exec(name);
  const base = match ? match[1] : name;
  const next = match ? `(copy ${Number(match[2] ?? 1) + 1})` : "(copy)";
  const suffix = ` ${next}`;
  return `${base.slice(0, MAX_WORKFLOW_NAME - suffix.length)}${suffix}`;
};

type SourceNode = {
  id: string;
  name: string;
  type: string;
  position: unknown;
  data: unknown;
  credentialId: string | null;
};

type SourceConnection = { fromNodeId: string; toNodeId: string; fromOutput: string; toInput: string };

export const buildWorkflowCopy = (
  source: { name: string; nodes: SourceNode[]; connections: SourceConnection[] },
  createId: () => string,
) => {
  const copied = instantiateTemplate(
    source.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: (node.data && typeof node.data === "object" ? node.data : {}) as Record<string, unknown>,
    })),
    source.connections,
    createId,
  );

  // instantiateTemplate keeps the order of the nodes it was given
  return {
    name: copyName(source.name),
    nodes: copied.nodes.map((node, index) => ({
      ...node,
      name: source.nodes[index].name,
      credentialId: source.nodes[index].credentialId,
    })),
    connections: copied.connections,
  };
};
