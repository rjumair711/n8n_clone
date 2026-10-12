// Git sync: a workflow as the JSON file that is kept in the repository,
// and a file as the rows of a workflow again. Nothing here talks to GitHub
// or the database; the node ids are made with Node's crypto.

import { createHash } from "node:crypto";
import z from "zod";
import { findSecretPatterns } from "@/lib/redaction";
import { WORKFLOW_FILE_FORMAT } from "./git-settings";

export * from "./git-settings";

const fileNode = z.object({
  id: z.string().min(1).max(100),
  type: z.string().min(1).max(60),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.string(), z.unknown()).default({}),
  // By name and type: a credential's id is another one in every workspace
  credential: z.object({ name: z.string().max(200), type: z.string().max(60) }).nullable().default(null),
});

const fileConnection = z.object({
  fromNodeId: z.string().min(1).max(100),
  toNodeId: z.string().min(1).max(100),
  fromOutput: z.string().max(100).default("main"),
  toInput: z.string().max(100).default("main"),
});

export const workflowFileSchema = z.object({
  rxjWorkflow: z.literal(WORKFLOW_FILE_FORMAT),
  // The workflow's id where it was first pushed from. It is how a pull
  // finds "the same workflow" again.
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  nodes: z.array(fileNode).max(500),
  connections: z.array(fileConnection).max(2000),
});

export type WorkflowFile = z.infer<typeof workflowFileSchema>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

// Keys in order, so the same workflow always gives the same text and a
// commit only shows what really changed
const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys);

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys(value[key])])
    );
  }

  return value;
};

type StoredNode = {
  id: string;
  type: string;
  position: unknown;
  data: unknown;
  credentialId?: string | null;
};

type StoredConnection = { fromNodeId: string; toNodeId: string; fromOutput: string; toInput: string };

/**
 * A workflow as its file. Credentials are named, never included, and the
 * node's own `credentialId` (an id of this workspace) is left out.
 */
export const toWorkflowFile = ({
  id,
  name,
  nodes,
  connections,
  credentials,
}: {
  id: string;
  name: string;
  nodes: StoredNode[];
  connections: StoredConnection[];
  credentials: ReadonlyMap<string, { name: string; type: string }>;
}): WorkflowFile => ({
  rxjWorkflow: WORKFLOW_FILE_FORMAT,
  id,
  name,
  nodes: nodes
    .map((node) => {
      const data = { ...(isRecord(node.data) ? node.data : {}) };
      const credentialId =
        node.credentialId ?? (typeof data.credentialId === "string" ? data.credentialId : null);
      const credential = credentialId ? credentials.get(credentialId) : undefined;

      delete data.credentialId;

      const position = isRecord(node.position) ? node.position : {};

      return {
        id: node.id,
        type: node.type,
        position: {
          x: typeof position.x === "number" ? position.x : 0,
          y: typeof position.y === "number" ? position.y : 0,
        },
        data: sortKeys(data) as Record<string, unknown>,
        credential: credential ? { name: credential.name, type: credential.type } : null,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id)),
  connections: connections
    .map(({ fromNodeId, toNodeId, fromOutput, toInput }) => ({ fromNodeId, toNodeId, fromOutput, toInput }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
});

export const serializeWorkflowFile = (file: WorkflowFile) => `${JSON.stringify(file, null, 2)}\n`;

export const workflowFilePath = (folder: string, id: string) => `${folder}/${id}.json`;

export const parseWorkflowFile = (
  text: string
): { ok: true; file: WorkflowFile } | { ok: false; error: string } => {
  let json: unknown;

  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "it is not JSON" };
  }

  const parsed = workflowFileSchema.safeParse(json);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];

    return {
      ok: false,
      error: `it is not a workflow file (${issue.path.join(".") || "file"}: ${issue.message})`,
    };
  }

  const ids = new Set(parsed.data.nodes.map((node) => node.id));

  if (ids.size !== parsed.data.nodes.length) return { ok: false, error: "two of its nodes have the same id" };

  if (parsed.data.connections.some((c) => !ids.has(c.fromNodeId) || !ids.has(c.toNodeId))) {
    return { ok: false, error: "a connection points at a node that is not in the file" };
  }

  return { ok: true, file: parsed.data };
};

/**
 * The kinds of secret typed into a workflow's nodes (an API key in a
 * header, a token in a URL), by name. A workflow that has any is not
 * pushed: a repository is read by more people than a workspace.
 */
export const findFileSecrets = (file: WorkflowFile): string[] => [
  ...new Set(file.nodes.flatMap((node) => findSecretPatterns(JSON.stringify(node.data)))),
];

/**
 * The id a file's node gets in a workspace that did not make the file.
 * Node ids are unique over all workspaces, so the file's own cannot be
 * used; the same node gets the same id on every pull, so what belongs to
 * the node (its executions' logs, its pinned data) stays with it.
 */
export const importedNodeId = (workspaceId: string, fileId: string, nodeId: string) =>
  `g${createHash("sha256").update(`${workspaceId}\n${fileId}\n${nodeId}`).digest("hex").slice(0, 31)}`;

export type ImportedWorkflow = {
  nodes: {
    id: string;
    type: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
    credentialId: string | null;
  }[];
  connections: StoredConnection[];
  // For the person who pulled: what to look at
  warnings: string[];
};

/**
 * A file as the nodes and connections of a workflow in this workspace.
 */
export const fromWorkflowFile = ({
  file,
  workspaceId,
  // The workflow was made here: its nodes keep the ids they have
  keepNodeIds,
  nodeTypes,
  credentials,
  workflowIds,
}: {
  file: WorkflowFile;
  workspaceId: string;
  keepNodeIds: boolean;
  // The node types this version of the app has
  nodeTypes: ReadonlySet<string>;
  // This workspace's credentials, by `${type}\n${name}`
  credentials: ReadonlyMap<string, string>;
  // File id -> this workspace's workflow id, for nodes that name a workflow
  workflowIds: ReadonlyMap<string, string>;
}): ImportedWorkflow => {
  const warnings: string[] = [];
  const idOf = (nodeId: string) => (keepNodeIds ? nodeId : importedNodeId(workspaceId, file.id, nodeId));

  const known = file.nodes.filter((node) => nodeTypes.has(node.type));
  const unknown = file.nodes.filter((node) => !nodeTypes.has(node.type));

  if (unknown.length > 0) {
    warnings.push(
      `left out ${unknown.length} node${unknown.length === 1 ? "" : "s"} of a type this app does not have (${[...new Set(unknown.map((node) => node.type))].join(", ")})`
    );
  }

  const kept = new Set(known.map((node) => node.id));

  const nodes = known.map((node) => {
    const data = { ...node.data };
    let credentialId: string | null = null;

    if (node.credential) {
      credentialId = credentials.get(`${node.credential.type}\n${node.credential.name}`) ?? null;

      if (credentialId) {
        // The dialogs read the node's credential from its data
        data.credentialId = credentialId;
      } else {
        warnings.push(`needs a ${node.credential.type} credential named "${node.credential.name}"`);
      }
    }

    // A node that runs another workflow names it by id
    if (typeof data.workflowId === "string" && workflowIds.has(data.workflowId)) {
      data.workflowId = workflowIds.get(data.workflowId);
    }

    return { id: idOf(node.id), type: node.type, position: node.position, data, credentialId };
  });

  return {
    nodes,
    connections: file.connections
      .filter((connection) => kept.has(connection.fromNodeId) && kept.has(connection.toNodeId))
      .map((connection) => ({
        ...connection,
        fromNodeId: idOf(connection.fromNodeId),
        toNodeId: idOf(connection.toNodeId),
      })),
    warnings: [...new Set(warnings)],
  };
};
