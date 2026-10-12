// Workflow version history: what a version holds, how two versions are
// compared, and which old versions are removed. Nothing here touches the
// database and there are no server-only imports: the editor shows the
// summaries and the tests use the rules.

import { getNodeLabel } from "@/config/node-labels";

// A workflow keeps its newest versions up to this many, and of those only
// the ones made in the last days. The newest version always stays.
export const WORKFLOW_VERSION_LIMIT = 50;
export const WORKFLOW_VERSION_DAYS = 30;

export type VersionNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  credentialId: string | null;
};

export type VersionConnection = {
  fromNodeId: string;
  toNodeId: string;
  fromOutput: string;
  toInput: string;
};

export type VersionSnapshot = {
  nodes: VersionNode[];
  connections: VersionConnection[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const readPosition = (value: unknown) => {
  const position = isRecord(value) ? value : {};

  return {
    x: typeof position.x === "number" ? position.x : 0,
    y: typeof position.y === "number" ? position.y : 0,
  };
};

const connectionKey = (connection: VersionConnection) =>
  [connection.fromNodeId, connection.fromOutput, connection.toNodeId, connection.toInput].join("\u0000");

/**
 * The saved nodes and connections of a workflow as a version keeps them, in
 * a fixed order, so the same workflow always gives the same snapshot.
 */
export const toVersionSnapshot = (
  nodes: {
    id: string;
    type: string;
    position: unknown;
    data: unknown;
    credentialId?: string | null;
  }[],
  connections: VersionConnection[]
): VersionSnapshot => ({
  nodes: nodes
    .map((node) => ({
      id: node.id,
      type: node.type,
      position: readPosition(node.position),
      data: isRecord(node.data) ? node.data : {},
      credentialId: node.credentialId ?? null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id)),
  connections: connections
    .map(({ fromNodeId, toNodeId, fromOutput, toInput }) => ({
      fromNodeId,
      toNodeId,
      fromOutput,
      toInput,
    }))
    .sort((a, b) => connectionKey(a).localeCompare(connectionKey(b))),
});

/**
 * A stored snapshot read back. Anything that is not a node or a connection
 * is left out, so a damaged row cannot break the editor.
 */
export const readVersionSnapshot = (nodes: unknown, connections: unknown): VersionSnapshot =>
  toVersionSnapshot(
    (Array.isArray(nodes) ? nodes : []).filter(
      (node): node is VersionNode =>
        isRecord(node) && typeof node.id === "string" && typeof node.type === "string"
    ),
    (Array.isArray(connections) ? connections : []).filter(
      (connection): connection is VersionConnection =>
        isRecord(connection) &&
        typeof connection.fromNodeId === "string" &&
        typeof connection.toNodeId === "string" &&
        typeof connection.fromOutput === "string" &&
        typeof connection.toInput === "string"
    )
  );

/**
 * JSON with the keys of every object in order: two values that are equal
 * give the same text, whatever order their keys were written in.
 */
export const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value) ?? "null";
};

// =========================================================================
// WHAT CHANGED
// =========================================================================
// A node as the summary names it: its type and, when it has one, the
// variable name the user gave it. Never any of its settings.
export type SummaryNode = { type: string; name?: string };

export type VersionSummary = {
  // The first version of the workflow: everything in it is "added"
  first: boolean;
  added: SummaryNode[];
  removed: SummaryNode[];
  // Settings or credential changed
  changed: SummaryNode[];
  // Only dragged to another place
  moved: number;
  connectionsAdded: number;
  connectionsRemoved: number;
};

const describe = (node: VersionNode): SummaryNode => {
  const name = node.data.variableName;

  return typeof name === "string" && name.trim()
    ? { type: node.type, name: name.trim().slice(0, 60) }
    : { type: node.type };
};

export const diffSnapshots = (
  previous: VersionSnapshot | null,
  next: VersionSnapshot
): VersionSummary => {
  const before = new Map((previous?.nodes ?? []).map((node) => [node.id, node]));
  const after = new Map(next.nodes.map((node) => [node.id, node]));

  const summary: VersionSummary = {
    first: previous === null,
    added: [],
    removed: [],
    changed: [],
    moved: 0,
    connectionsAdded: 0,
    connectionsRemoved: 0,
  };

  for (const node of next.nodes) {
    const old = before.get(node.id);

    if (!old) {
      summary.added.push(describe(node));
    } else if (
      old.type !== node.type ||
      old.credentialId !== node.credentialId ||
      stableStringify(old.data) !== stableStringify(node.data)
    ) {
      summary.changed.push(describe(node));
    } else if (old.position.x !== node.position.x || old.position.y !== node.position.y) {
      summary.moved++;
    }
  }

  for (const node of previous?.nodes ?? []) {
    if (!after.has(node.id)) summary.removed.push(describe(node));
  }

  const oldConnections = new Set((previous?.connections ?? []).map(connectionKey));
  const newConnections = new Set(next.connections.map(connectionKey));

  summary.connectionsAdded = [...newConnections].filter((key) => !oldConnections.has(key)).length;
  summary.connectionsRemoved = [...oldConnections].filter((key) => !newConnections.has(key)).length;

  return summary;
};

/**
 * A stored summary read back, with everything it should have.
 */
export const readVersionSummary = (value: unknown): VersionSummary => {
  const source = isRecord(value) ? value : {};

  const list = (entries: unknown): SummaryNode[] =>
    (Array.isArray(entries) ? entries : []).flatMap((entry) =>
      isRecord(entry) && typeof entry.type === "string"
        ? [{ type: entry.type, ...(typeof entry.name === "string" ? { name: entry.name } : {}) }]
        : []
    );

  const count = (entry: unknown) => (typeof entry === "number" && entry > 0 ? Math.floor(entry) : 0);

  return {
    first: source.first === true,
    added: list(source.added),
    removed: list(source.removed),
    changed: list(source.changed),
    moved: count(source.moved),
    connectionsAdded: count(source.connectionsAdded),
    connectionsRemoved: count(source.connectionsRemoved),
  };
};

const MAX_NAMED = 4;

const nameNodes = (nodes: SummaryNode[]) => {
  const names = nodes
    .slice(0, MAX_NAMED)
    .map((node) => (node.name ? `${getNodeLabel(node.type)} (${node.name})` : getNodeLabel(node.type)));

  return nodes.length > MAX_NAMED
    ? `${names.join(", ")} and ${nodes.length - MAX_NAMED} more`
    : names.join(", ");
};

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * The summary as lines of text: "Added: HTTP Request (myApiCall)".
 */
export const formatVersionSummary = (summary: VersionSummary): string[] => {
  if (summary.first) {
    return [
      summary.added.length === 0
        ? "First version: an empty workflow"
        : `First version: ${plural(summary.added.length, "node")}`,
    ];
  }

  const lines: string[] = [];

  if (summary.added.length > 0) lines.push(`Added: ${nameNodes(summary.added)}`);
  if (summary.removed.length > 0) lines.push(`Removed: ${nameNodes(summary.removed)}`);
  if (summary.changed.length > 0) lines.push(`Changed: ${nameNodes(summary.changed)}`);

  if (summary.connectionsAdded > 0 || summary.connectionsRemoved > 0) {
    lines.push(
      `Connections: ${[
        summary.connectionsAdded > 0 ? `${summary.connectionsAdded} added` : "",
        summary.connectionsRemoved > 0 ? `${summary.connectionsRemoved} removed` : "",
      ]
        .filter(Boolean)
        .join(", ")}`
    );
  }

  if (summary.moved > 0 && lines.length === 0) {
    lines.push(`Layout only: ${plural(summary.moved, "node")} moved`);
  }

  return lines.length > 0 ? lines : ["No changes to nodes or connections"];
};

// =========================================================================
// WHICH VERSIONS ARE REMOVED
// =========================================================================
/**
 * The versions to delete: everything beyond the newest `limit`, and of the
 * rest what is older than `days`. The newest version is never deleted, so
 * a workflow that was not touched for a long time still has the version
 * its runs refer to.
 */
export const selectVersionsToPrune = (
  versions: { id: string; number: number; createdAt: Date }[],
  now: Date = new Date(),
  { limit = WORKFLOW_VERSION_LIMIT, days = WORKFLOW_VERSION_DAYS } = {}
): string[] => {
  const newestFirst = [...versions].sort((a, b) => b.number - a.number);
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;

  return newestFirst
    .filter(
      (version, index) =>
        index > 0 && (index >= limit || version.createdAt.getTime() < cutoff)
    )
    .map((version) => version.id);
};
