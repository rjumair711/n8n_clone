// Workflow export and import as JSON, for backups and for moving a workflow
// to another account. Pure functions, so the rules can be tested without a
// database.
//
// What an export leaves out: webhook and signing secrets, WhatsApp verify
// tokens and app secrets, and Slack/Discord webhook URLs (the same secrets
// a template never contains). It keeps which credential a node uses: an
// id is not a secret, and importing into the same account reconnects it.
// Importing into another account clears the references it does not own,
// so a node there asks for a credential instead of pointing at someone
// else's.

import { z } from "zod";
import { instantiateTemplate, type TemplateConnection, type TemplateNode } from "@/features/templates/lib/template-data";

export const WORKFLOW_EXPORT_FORMAT = "rxj-workflow";
export const WORKFLOW_EXPORT_VERSION = 1;

// A workflow file larger than this is not a workflow
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_NODES = 500;

// Never exported
export const EXPORT_SECRET_KEYS = new Set([
  "secret",
  "signingSecret",
  "verifyToken",
  "appSecret",
  "webhookUrl",
]);

// Kept, and checked against the importing account
export const CREDENTIAL_KEYS = new Set(["credentialId", "rerankCredentialId", "embeddingCredentialId"]);
// Execute Workflow's target workflow
export const WORKFLOW_REFERENCE_KEYS = new Set(["workflowId"]);

const mapDeep = (
  value: unknown,
  visit: (key: string, inner: unknown) => { keep: boolean; value?: unknown },
): unknown => {
  if (Array.isArray(value)) return value.map((item) => mapDeep(item, visit));
  if (value !== null && typeof value === "object") {
    const entries: [string, unknown][] = [];
    for (const [key, inner] of Object.entries(value)) {
      const result = visit(key, inner);
      if (!result.keep) continue;
      entries.push([key, mapDeep("value" in result ? result.value : inner, visit)]);
    }
    return Object.fromEntries(entries);
  }
  return value;
};

export type ExportNode = { id: string; type: string; position: unknown; data: unknown };

export type WorkflowExport = {
  format: typeof WORKFLOW_EXPORT_FORMAT;
  version: typeof WORKFLOW_EXPORT_VERSION;
  name: string;
  exportedAt: string;
  nodes: TemplateNode[];
  connections: TemplateConnection[];
};

/** The file a workflow is downloaded as. */
export const buildWorkflowExport = (
  workflow: { name: string; nodes: ExportNode[]; connections: TemplateConnection[] },
  now: Date = new Date(),
): WorkflowExport => {
  const nodes = workflow.nodes.filter((node) => node.type !== "INITIAL");
  const ids = new Set(nodes.map((node) => node.id));

  return {
    format: WORKFLOW_EXPORT_FORMAT,
    version: WORKFLOW_EXPORT_VERSION,
    name: workflow.name,
    exportedAt: now.toISOString(),
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: mapDeep(node.data ?? {}, (key) => ({ keep: !EXPORT_SECRET_KEYS.has(key) })) as Record<string, unknown>,
    })),
    connections: workflow.connections
      .filter((conn) => ids.has(conn.fromNodeId) && ids.has(conn.toNodeId))
      .map(({ fromNodeId, toNodeId, fromOutput, toInput }) => ({ fromNodeId, toNodeId, fromOutput, toInput })),
  };
};

/** A safe file name: "Order bot (WhatsApp)" -> "order-bot-whatsapp.json" */
export const exportFileName = (name: string): string =>
  `${
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "workflow"
  }.json`;

const nodeSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.string().min(1).max(100),
  position: z
    .object({ x: z.number().finite(), y: z.number().finite() })
    .catch({ x: 0, y: 0 }),
  data: z.record(z.string(), z.unknown()).catch({}),
});

const connectionSchema = z.object({
  fromNodeId: z.string().min(1),
  toNodeId: z.string().min(1),
  fromOutput: z.string().default("main"),
  toInput: z.string().default("main"),
});

const fileSchema = z.object({
  format: z.literal(WORKFLOW_EXPORT_FORMAT).optional(),
  version: z.number().optional(),
  name: z.string().max(200).optional(),
  nodes: z.array(nodeSchema).max(MAX_IMPORT_NODES),
  connections: z.array(connectionSchema).max(MAX_IMPORT_NODES * 10).default([]),
});

export class WorkflowImportError extends Error {}

export type ParsedWorkflowFile = z.infer<typeof fileSchema> & { name: string };

/** Reads an exported file, or says in plain words why it is not one. */
export const parseWorkflowFile = (text: string): ParsedWorkflowFile => {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) {
    throw new WorkflowImportError("The file is larger than 2 MB, so it is not an RXJ workflow");
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new WorkflowImportError("The file is not valid JSON");
  }

  const record = json as Record<string, unknown> | null;
  const nodes = Array.isArray(record?.nodes) ? (record.nodes as Record<string, unknown>[]) : null;

  // n8n's files have node types like "n8n-nodes-base.httpRequest" and
  // connections keyed by node name
  if (nodes?.some((node) => typeof node?.type === "string" && /^(@n8n\/)?n8n-nodes-/.test(node.type))) {
    throw new WorkflowImportError(
      "This is an n8n workflow. RXJ can import workflows exported from RXJ; rebuild n8n workflows here, or start from a template",
    );
  }

  if (record && typeof record.version === "number" && record.version > WORKFLOW_EXPORT_VERSION) {
    throw new WorkflowImportError("This file was exported by a newer version of RXJ");
  }

  const parsed = fileSchema.safeParse(json);
  if (!parsed.success) {
    throw new WorkflowImportError("The file is not an RXJ workflow export (it needs a list of nodes)");
  }

  const ids = parsed.data.nodes.map((node) => node.id);
  if (new Set(ids).size !== ids.length) {
    throw new WorkflowImportError("The file has two nodes with the same id");
  }

  return { ...parsed.data, name: parsed.data.name?.trim() || "Imported workflow" };
};

export type ImportReport = {
  skippedTypes: string[];
  clearedCredentials: number;
  clearedWorkflowLinks: number;
};

/**
 * The nodes and connections to create for the importing account: fresh
 * node ids, unknown node types left out, and references to credentials or
 * workflows that this account does not own removed.
 */
export const prepareWorkflowImport = (
  file: ParsedWorkflowFile,
  options: {
    knownTypes: Set<string>;
    ownedCredentialIds: Set<string>;
    ownedWorkflowIds: Set<string>;
    createId: () => string;
  },
) => {
  const report: ImportReport = { skippedTypes: [], clearedCredentials: 0, clearedWorkflowLinks: 0 };

  const kept = file.nodes.filter((node) => node.type !== "INITIAL");
  const known = kept.filter((node) => options.knownTypes.has(node.type));
  report.skippedTypes = [...new Set(kept.filter((node) => !options.knownTypes.has(node.type)).map((node) => node.type))];

  const cleaned: TemplateNode[] = known.map((node) => ({
    id: node.id,
    type: node.type,
    position: node.position,
    data: mapDeep(node.data, (key, value) => {
      // A secret in a hand-made file is dropped like on export
      if (EXPORT_SECRET_KEYS.has(key)) return { keep: false };
      if (CREDENTIAL_KEYS.has(key) && typeof value === "string" && value) {
        if (options.ownedCredentialIds.has(value)) return { keep: true };
        report.clearedCredentials++;
        return { keep: false };
      }
      if (WORKFLOW_REFERENCE_KEYS.has(key) && typeof value === "string" && value) {
        if (options.ownedWorkflowIds.has(value)) return { keep: true };
        report.clearedWorkflowLinks++;
        return { keep: false };
      }
      return { keep: true };
    }) as Record<string, unknown>,
  }));

  const copy = instantiateTemplate(cleaned, file.connections, options.createId);
  return { name: file.name, nodes: copy.nodes, connections: copy.connections, report };
};

/** What the import toast says besides "imported". */
export const describeImportReport = (report: ImportReport): string[] => [
  ...(report.skippedTypes.length
    ? [`Left out node types this server does not have: ${report.skippedTypes.join(", ")}`]
    : []),
  ...(report.clearedCredentials
    ? [`${report.clearedCredentials} node credential${report.clearedCredentials === 1 ? "" : "s"} must be selected again`]
    : []),
  ...(report.clearedWorkflowLinks
    ? ["Execute Workflow nodes must have their workflow selected again"]
    : []),
];
