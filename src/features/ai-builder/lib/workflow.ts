// "Build with AI": the JSON a model has to answer with, the check of that
// answer against the node catalogue, and turning it into nodes and edges
// the editor can show. Pure functions: no database, no model, no React.

import z from "zod";
import { buildGraph } from "@/inngest/engine";
import { parseCategories, OTHER_CATEGORY_ID } from "@/features/executions/lib/ai-fields";
import type { CatalogueField, CatalogueNode, CataloguePort } from "./catalogue";
import { hidePrivateSettings } from "./private-keys";
import { TOOL_APPROVAL_DEFAULT_BY_RISK } from "@/lib/approvals";

export const MAX_GENERATED_NODES = 60;
export const MAX_GENERATED_CONNECTIONS = 200;

// What the model is asked for (see prompt.ts for the wording)
export const generatedWorkflowSchema = z.object({
  name: z.string().max(200).nullish(),
  summary: z.string().max(4000).nullish(),
  nodes: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        type: z.string().min(1).max(60),
        data: z.record(z.string(), z.unknown()).nullish(),
      })
    )
    .min(1, "The workflow has no nodes")
    .max(MAX_GENERATED_NODES, `At most ${MAX_GENERATED_NODES} nodes`),
  connections: z
    .array(
      z.object({
        from: z.string().min(1).max(80),
        to: z.string().min(1).max(80),
        fromOutput: z.string().max(80).nullish(),
        toInput: z.string().max(80).nullish(),
      })
    )
    .max(MAX_GENERATED_CONNECTIONS)
    .nullish(),
});

export type WorkflowNode = {
  id: string;
  type: string;
  data: Record<string, unknown>;
};

export type WorkflowConnection = {
  from: string;
  to: string;
  fromOutput: string;
  toInput: string;
};

export type CheckedWorkflow = {
  name: string;
  summary: string;
  nodes: WorkflowNode[];
  connections: WorkflowConnection[];
};

/**
 * The JSON object in a model's answer. Models wrap JSON in a code fence or
 * a sentence often enough that the outermost { } is what is read.
 */
export const parseModelJson = (
  text: string
): { ok: true; value: unknown } | { ok: false; error: string } => {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end <= start) {
    return { ok: false, error: "The answer contains no JSON object." };
  }

  try {
    return { ok: true, value: JSON.parse(text.slice(start, end + 1)) };
  } catch (error) {
    return {
      ok: false,
      error: `The answer is not valid JSON: ${(error as Error).message}`,
    };
  }
};

const VARIABLE_NAME_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const hasExpression = (value: unknown) =>
  typeof value === "string" && value.includes("{{");

const isEmpty = (value: unknown) =>
  value === undefined ||
  value === null ||
  (typeof value === "string" && value.trim() === "") ||
  (Array.isArray(value) && value.length === 0);

// A value as a config-made node saves it: always a string
const toSettingString = (value: unknown): string =>
  typeof value === "string"
    ? value
    : value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);

const describeNode = (node: { id: string; type: string }) =>
  `Node "${node.id}" (${node.type})`;

/**
 * Checks one node's settings against its catalogue entry and returns them
 * in the shape the node saves them in.
 */
const checkSettings = (
  node: { id: string; type: string },
  raw: Record<string, unknown>,
  entry: CatalogueNode,
  errors: string[]
): Record<string, unknown> => {
  // Credentials and secrets are the user's to fill in
  const data: Record<string, unknown> = hidePrivateSettings(raw);
  const where = describeNode(node);

  if (entry.operations?.length) {
    const allowed = entry.operations.map((operation) => operation.value);

    if (isEmpty(data.operation)) {
      data.operation = allowed[0];
    } else if (!allowed.includes(String(data.operation))) {
      errors.push(
        `${where}: operation "${String(data.operation)}" does not exist. Use one of: ${allowed.join(", ")}.`
      );
    }
  }

  if (entry.variableName && isEmpty(data.variableName)) {
    data.variableName = entry.variableName;
  }

  if (
    typeof data.variableName === "string" &&
    !isEmpty(data.variableName) &&
    !VARIABLE_NAME_PATTERN.test(data.variableName.trim())
  ) {
    errors.push(
      `${where}: variableName "${data.variableName}" must start with a letter or underscore and contain only letters, numbers and underscores.`
    );
  }

  const applies = (field: CatalogueField) =>
    !field.operations?.length ||
    field.operations.includes(String(data.operation ?? ""));

  for (const field of entry.fields) {
    const value = data[field.name];

    if (isEmpty(value)) {
      if (field.required && applies(field)) {
        errors.push(`${where}: "${field.name}" is required.`);
      }
      continue;
    }

    if (field.type === "list") {
      if (!Array.isArray(value)) {
        errors.push(`${where}: "${field.name}" must be a JSON array.`);
      }
      continue;
    }

    if (field.type === "number" && !entry.stringValues) {
      const number = typeof value === "number" ? value : Number(value);

      if (Number.isFinite(number)) {
        data[field.name] = number;
      } else if (!hasExpression(value)) {
        errors.push(`${where}: "${field.name}" must be a number.`);
      }
      continue;
    }

    if (field.type === "boolean" && !entry.stringValues) {
      if (value === "true" || value === "false") {
        data[field.name] = value === "true";
      } else if (typeof value !== "boolean") {
        errors.push(`${where}: "${field.name}" must be true or false.`);
      }
      continue;
    }

    if (field.options?.length && !hasExpression(value)) {
      const text = String(value);

      if (!field.options.includes(text)) {
        errors.push(
          `${where}: "${field.name}" is "${text}". Use one of: ${field.options.join(", ")}.`
        );
      }
    }

    // The dialogs keep these as text: an object given for a JSON body
    // becomes its JSON
    if (typeof value !== "string") data[field.name] = toSettingString(value);
  }

  if (entry.stringValues) {
    for (const [key, value] of Object.entries(data)) {
      data[key] = toSettingString(value);
    }
  }

  return data;
};

/**
 * The output handles a node has with these settings.
 */
export const getNodeOutputs = (
  node: { type: string; data: Record<string, unknown> },
  entry: CatalogueNode
): CataloguePort[] => {
  if (node.type === "SWITCH") {
    const rules = Array.isArray(node.data.rules) ? node.data.rules : [];

    return [
      ...rules.flatMap((rule) => {
        const { id, label } = (rule ?? {}) as { id?: unknown; label?: unknown };
        return typeof id === "string" && id
          ? [{ id, label: typeof label === "string" ? label : id }]
          : [];
      }),
      ...(node.data.fallbackBranch === false
        ? []
        : [{ id: "default", label: "Default" }]),
    ];
  }

  if (node.type === "TEXT_CLASSIFIER") {
    return [
      ...parseCategories(String(node.data.categories ?? "")).map((category) => ({
        id: category.id,
        label: category.name,
      })),
      { id: OTHER_CATEGORY_ID, label: "Other" },
    ];
  }

  return entry.outputs;
};

// What a model writes when it means "the ordinary port"
const UNNAMED_PORTS = new Set(["", "main", "output", "input"]);

const findPort = (ports: CataloguePort[], name: string) => {
  const wanted = name.trim().toLowerCase();

  return (
    ports.find((port) => port.id === name) ??
    ports.find((port) => port.id.toLowerCase() === wanted) ??
    ports.find((port) => port.label.toLowerCase() === wanted)
  );
};

const listPorts = (ports: CataloguePort[]) =>
  ports.map((port) => `"${port.id}"`).join(", ");

const isSubPort = (id: string) => id.startsWith("sub-");

/**
 * n8n draws a loop by connecting its last node back to the loop node. Here
 * the Loop node moves on by itself, and such a connection would be a cycle:
 * it is dropped instead of refused.
 */
const dropLoopBackEdges = (
  nodes: WorkflowNode[],
  connections: WorkflowConnection[]
): WorkflowConnection[] => {
  const loops = nodes.filter((node) => node.type === "LOOP");
  if (loops.length === 0) return connections;

  const backEdges = new Set<WorkflowConnection>();

  for (const loop of loops) {
    const body = new Set<string>();
    const queue = connections
      .filter((conn) => conn.from === loop.id && conn.fromOutput === "loop")
      .map((conn) => conn.to);

    while (queue.length > 0) {
      const id = queue.pop()!;
      if (id === loop.id || body.has(id)) continue;
      body.add(id);

      for (const conn of connections) {
        if (conn.from === id && !isSubPort(conn.toInput)) queue.push(conn.to);
      }
    }

    for (const conn of connections) {
      if (conn.to === loop.id && body.has(conn.from)) backEdges.add(conn);
    }
  }

  return connections.filter((conn) => !backEdges.has(conn));
};

// For the error message only: the nodes that are part of a cycle
const findCycleNodes = (
  nodes: WorkflowNode[],
  connections: WorkflowConnection[]
): string[] => {
  const flow = connections.filter((conn) => !isSubPort(conn.toInput));
  const remaining = new Set(nodes.map((node) => node.id));

  // Take away nodes nothing leads to, or that lead nowhere, until none is left
  let changed = true;
  while (changed) {
    changed = false;

    for (const id of [...remaining]) {
      const live = flow.filter(
        (conn) => remaining.has(conn.from) && remaining.has(conn.to)
      );

      if (
        !live.some((conn) => conn.to === id) ||
        !live.some((conn) => conn.from === id)
      ) {
        remaining.delete(id);
        changed = true;
      }
    }
  }

  return [...remaining];
};

/**
 * Checks a model's answer. `errors` is what the model is told when it has
 * to try again, so each one says which node it is about and what to do.
 *
 * `lockedTypes` are node types that exist but that the user's plan does
 * not include (type -> the plan that has it).
 */
export const checkGeneratedWorkflow = (
  raw: unknown,
  catalogue: CatalogueNode[],
  lockedTypes: Record<string, string> = {}
): { workflow: CheckedWorkflow | null; errors: string[] } => {
  const parsed = generatedWorkflowSchema.safeParse(raw);

  if (!parsed.success) {
    return {
      workflow: null,
      errors: parsed.error.issues
        .slice(0, 20)
        .map((issue) => `${issue.path.join(".") || "answer"}: ${issue.message}`),
    };
  }

  const errors: string[] = [];
  const entryByType = new Map(catalogue.map((entry) => [entry.type, entry]));

  // ------------------------------------------------------------- nodes
  const seen = new Set<string>();
  const nodes: WorkflowNode[] = [];

  for (const node of parsed.data.nodes) {
    const type = node.type.trim().toUpperCase();

    if (seen.has(node.id)) {
      errors.push(`Two nodes have the id "${node.id}". Every node needs its own id.`);
      continue;
    }
    seen.add(node.id);

    const entry = entryByType.get(type);

    if (!entry) {
      errors.push(
        lockedTypes[type]
          ? `${describeNode({ id: node.id, type })}: this node needs the ${lockedTypes[type]} plan, which this account does not have. Build the workflow without it.`
          : `Node "${node.id}": "${node.type}" is not a node type. Use only the types in the catalogue.`
      );
      continue;
    }

    nodes.push({
      id: node.id,
      type,
      data: checkSettings({ id: node.id, type }, node.data ?? {}, entry, errors),
    });
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const entryOf = (node: WorkflowNode) => entryByType.get(node.type)!;

  if (nodes.filter((node) => node.type === "MANUAL_TRIGGER").length > 1) {
    errors.push("Only one MANUAL_TRIGGER is allowed per workflow.");
  }

  if (nodes.length > 0 && !nodes.some((node) => entryOf(node).trigger)) {
    errors.push(
      "The workflow has no trigger node, so nothing would start it. Add one (MANUAL_TRIGGER when nothing else fits)."
    );
  }

  // -------------------------------------------------------- connections
  let connections: WorkflowConnection[] = [];
  const keys = new Set<string>();

  for (const conn of parsed.data.connections ?? []) {
    const source = nodeById.get(conn.from);
    const target = nodeById.get(conn.to);

    if (!source || !target) {
      // A connection of a node that was refused above is not a second error
      const missing = [conn.from, conn.to].filter((id) => !seen.has(id));
      if (missing.length > 0) {
        errors.push(
          `A connection uses the node id "${missing[0]}", which no node has.`
        );
      }
      continue;
    }

    if (source.id === target.id) {
      errors.push(`${describeNode(source)} is connected to itself.`);
      continue;
    }

    const outputs = getNodeOutputs(source, entryOf(source));
    const inputs = entryOf(target).inputs;
    const link = `The connection from "${source.id}" to "${target.id}"`;

    const outputName = (conn.fromOutput ?? "").trim();
    let output = findPort(outputs, outputName);

    if (!output && UNNAMED_PORTS.has(outputName.toLowerCase())) {
      if (outputs.length === 1) {
        output = outputs[0];
      } else {
        errors.push(
          `${link} has to say which output of ${source.type} it leaves from (fromOutput): ${listPorts(outputs)}.`
        );
        continue;
      }
    }

    if (!output) {
      errors.push(
        `${link}: ${source.type} has no output "${outputName}". Its outputs are: ${listPorts(outputs) || "none"}.`
      );
      continue;
    }

    if (inputs.length === 0) {
      errors.push(
        `${link}: ${target.type} is a trigger. It starts the workflow and nothing can be connected into it.`
      );
      continue;
    }

    const inputName = (conn.toInput ?? "").trim();
    let input = findPort(inputs, inputName);

    if (!input && UNNAMED_PORTS.has(inputName.toLowerCase())) {
      // A model, memory or parser node only makes sense on the port made
      // for it, also when the model left the port out
      const fitting = inputs.filter((port) => port.accepts?.includes(source.type));

      input =
        fitting.length === 1
          ? fitting[0]
          : inputs.find((port) => !isSubPort(port.id));
    }

    if (!input) {
      errors.push(
        `${link}: ${target.type} has no input "${inputName}". Its inputs are: ${listPorts(inputs)}.`
      );
      continue;
    }

    if (input.accepts && !input.accepts.includes(source.type)) {
      errors.push(
        `${link}: the "${input.id}" port of ${target.type} only takes ${input.accepts.join(", ")}, not ${source.type}.`
      );
      continue;
    }

    const key = [source.id, target.id, output.id, input.id].join("\u0000");
    if (keys.has(key)) continue;
    keys.add(key);

    connections.push({
      from: source.id,
      to: target.id,
      fromOutput: output.id,
      toInput: input.id,
    });
  }

  connections = dropLoopBackEdges(nodes, connections);

  // ------------------------------------------------------------- shape
  try {
    buildGraph(
      nodes,
      connections.map((conn) => ({
        fromNodeId: conn.from,
        toNodeId: conn.to,
        fromOutput: conn.fromOutput,
        toInput: conn.toInput,
      }))
    );
  } catch {
    const cycle = findCycleNodes(nodes, connections);

    errors.push(
      `The connections form a cycle${cycle.length ? ` (${cycle.map((id) => `"${id}"`).join(", ")})` : ""}. A workflow only runs forward. To repeat nodes for every item of a list, connect them to the "loop" output of a LOOP node and do not connect back.`
    );
  }

  if (nodes.length > 1) {
    for (const node of nodes) {
      if (!connections.some((conn) => conn.from === node.id || conn.to === node.id)) {
        errors.push(`${describeNode(node)} is not connected to anything.`);
      }
    }
  }

  // Nodes that only supply a model, a memory or a tool to another node
  const supplyIds = new Set(
    nodes
      .filter((node) => {
        const outgoing = connections.filter((conn) => conn.from === node.id);
        return outgoing.length > 0 && outgoing.every((conn) => isSubPort(conn.toInput));
      })
      .map((node) => node.id)
  );

  for (const node of nodes) {
    if (
      (node.type === "AI_AGENT" || node.type === "AI_AGENT_TOOL") &&
      !connections.some((conn) => conn.to === node.id && conn.toInput === "sub-model")
    ) {
      errors.push(
        `${describeNode(node)} has no chat model. Add a model node (OPENAI, ANTHROPIC, GEMINI, CHAT_MODEL ...) and connect it to this node with toInput "sub-model".`
      );
    }
  }

  // Two nodes writing to one variable would overwrite each other
  const namedBy = new Map<string, string>();
  for (const node of nodes) {
    const name = node.data.variableName;
    if (supplyIds.has(node.id) || typeof name !== "string" || !name.trim()) continue;

    const other = namedBy.get(name.trim());
    if (other) {
      errors.push(
        `Nodes "${other}" and "${node.id}" both use the variableName "${name.trim()}". Give each its own.`
      );
    } else {
      namedBy.set(name.trim(), node.id);
    }
  }

  if (errors.length > 0) return { workflow: null, errors };

  return {
    workflow: {
      name: (parsed.data.name ?? "").trim().slice(0, 80),
      summary: (parsed.data.summary ?? "").trim().slice(0, 1500),
      nodes,
      connections,
    },
    errors: [],
  };
};

// ---------------------------------------------------------------------------
// From and to the editor

export type EditorNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
};

export type EditorEdge = {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

/**
 * The workflow on the canvas as the model gets it: short ids ("n1"), no
 * credentials or secrets, no positions, and without the empty start node.
 */
export const describeCurrentWorkflow = (
  nodes: EditorNode[],
  edges: EditorEdge[]
) => {
  const kept = nodes.filter((node) => node.type !== "INITIAL");
  const aliasById = new Map(kept.map((node, index) => [node.id, `n${index + 1}`]));

  return {
    idByAlias: new Map(kept.map((node) => [aliasById.get(node.id)!, node.id])),
    workflow: {
      nodes: kept.map((node) => ({
        id: aliasById.get(node.id)!,
        type: node.type,
        data: hidePrivateSettings(node.data ?? {}),
      })),
      connections: edges.flatMap((edge) => {
        const from = aliasById.get(edge.source);
        const to = aliasById.get(edge.target);

        return from && to
          ? [
              {
                from,
                to,
                fromOutput: edge.sourceHandle || "main",
                toInput: edge.targetHandle || "main",
              },
            ]
          : [];
      }),
    },
  };
};

const COLUMN_WIDTH = 260;
const ROW_HEIGHT = 160;
// Model, memory and tool nodes sit under the node they are plugged into
const SUPPLY_DROP = 200;
const SUPPLY_WIDTH = 160;

type Position = { x: number; y: number };

const tooClose = (a: Position, b: Position) =>
  Math.abs(a.x - b.x) < 180 && Math.abs(a.y - b.y) < 110;

/**
 * Where the nodes go on the canvas. Nodes that already have a place keep
 * it; the others are laid out left to right in the order they run.
 */
export const layoutWorkflow = (
  workflow: Pick<CheckedWorkflow, "nodes" | "connections">,
  fixed: Map<string, Position> = new Map()
): Map<string, Position> => {
  const positions = new Map(fixed);
  const { nodes, connections } = workflow;

  const flow = connections.filter((conn) => !isSubPort(conn.toInput));
  const supplies = connections.filter((conn) => isSubPort(conn.toInput));
  const supplyIds = new Set(
    nodes
      .filter(
        (node) =>
          supplies.some((conn) => conn.from === node.id) &&
          !flow.some((conn) => conn.from === node.id || conn.to === node.id)
      )
      .map((node) => node.id)
  );

  const flowNodes = nodes.filter((node) => !supplyIds.has(node.id));

  // The column of a node: one further than the furthest node before it
  const depth = new Map<string, number>();
  const depthOf = (id: string, trail: Set<string>): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (trail.has(id)) return 0;
    trail.add(id);

    const before = flow.filter((conn) => conn.to === id && !supplyIds.has(conn.from));
    const value =
      before.length === 0
        ? 0
        : Math.max(...before.map((conn) => depthOf(conn.from, trail))) + 1;

    depth.set(id, value);
    return value;
  };

  const place = (id: string, wanted: Position, step: Position) => {
    const position = { ...wanted };
    while ([...positions.values()].some((taken) => tooClose(taken, position))) {
      position.x += step.x;
      position.y += step.y;
    }
    positions.set(id, position);
  };

  // Leaves room under a row for the nodes plugged into it
  const rowHeight = supplies.length > 0 ? ROW_HEIGHT + SUPPLY_DROP : ROW_HEIGHT;
  const origin =
    fixed.size > 0
      ? {
          x: Math.min(...[...fixed.values()].map((position) => position.x)),
          y: Math.min(...[...fixed.values()].map((position) => position.y)),
        }
      : { x: 0, y: 0 };

  const ordered = [...flowNodes].sort(
    (a, b) => depthOf(a.id, new Set()) - depthOf(b.id, new Set())
  );

  for (const node of ordered) {
    if (positions.has(node.id)) continue;

    const before = flow
      .filter((conn) => conn.to === node.id)
      .flatMap((conn) => positions.get(conn.from) ?? []);
    const after = flow
      .filter((conn) => conn.from === node.id)
      .flatMap((conn) => positions.get(conn.to) ?? []);

    const wanted =
      before.length > 0
        ? {
            x: Math.max(...before.map((position) => position.x)) + COLUMN_WIDTH,
            y: before[0].y,
          }
        : after.length > 0 && fixed.size > 0
          ? {
              x: Math.min(...after.map((position) => position.x)) - COLUMN_WIDTH,
              y: after[0].y,
            }
          : { x: origin.x + depthOf(node.id, new Set()) * COLUMN_WIDTH, y: origin.y };

    place(node.id, wanted, { x: 0, y: rowHeight });
  }

  // Plugged-in nodes, nearest to the flow first (a Model Router's own
  // models hang under the router)
  let waiting = nodes.filter((node) => supplyIds.has(node.id) && !positions.has(node.id));
  while (waiting.length > 0) {
    const ready = waiting.filter((node) =>
      supplies.some((conn) => conn.from === node.id && positions.has(conn.to))
    );
    if (ready.length === 0) break;

    for (const node of ready) {
      const host = positions.get(
        supplies.find((conn) => conn.from === node.id && positions.has(conn.to))!.to
      )!;

      place(node.id, { x: host.x, y: host.y + SUPPLY_DROP }, { x: SUPPLY_WIDTH, y: 0 });
    }

    waiting = waiting.filter((node) => !positions.has(node.id));
  }

  // Whatever is left (nothing, for a checked workflow) still needs a place
  for (const node of nodes) {
    if (!positions.has(node.id)) {
      place(node.id, { ...origin }, { x: 0, y: rowHeight });
    }
  }

  return positions;
};

export type BuiltGraph = {
  name: string;
  summary: string;
  nodes: EditorNode[];
  edges: {
    id: string;
    source: string;
    target: string;
    sourceHandle: string;
    targetHandle: string;
  }[];
  // What the user still has to fill in before the workflow can run
  todo: string[];
};

/**
 * Turns a checked answer into the nodes and edges of the editor.
 *
 * A node the model kept (same id, same type) keeps its real id, its place
 * and every setting the model did not get to see: its credential, its
 * secrets. Everything else is a new node with a new id and no credential.
 */
export const toEditorGraph = ({
  workflow,
  catalogue,
  current = [],
  idByAlias = new Map(),
  createId,
}: {
  workflow: CheckedWorkflow;
  catalogue: CatalogueNode[];
  current?: EditorNode[];
  idByAlias?: Map<string, string>;
  createId: () => string;
}): BuiltGraph => {
  const currentById = new Map(current.map((node) => [node.id, node]));
  const entryByType = new Map(catalogue.map((entry) => [entry.type, entry]));

  const idOf = new Map<string, string>();
  const keptFrom = new Map<string, EditorNode>();

  for (const node of workflow.nodes) {
    const existing = currentById.get(idByAlias.get(node.id) ?? "");

    // Changing a node's type makes it another node: its old settings and
    // credential do not fit the new one
    if (existing && existing.type === node.type && !keptFrom.has(existing.id)) {
      idOf.set(node.id, existing.id);
      keptFrom.set(existing.id, existing);
    } else {
      idOf.set(node.id, createId());
    }
  }

  const real = {
    nodes: workflow.nodes.map((node) => ({ ...node, id: idOf.get(node.id)! })),
    connections: workflow.connections.map((conn) => ({
      ...conn,
      from: idOf.get(conn.from)!,
      to: idOf.get(conn.to)!,
    })),
  };

  const positions = layoutWorkflow(
    real,
    new Map([...keptFrom.values()].map((node) => [node.id, node.position]))
  );

  const nodes = real.nodes.map((node): EditorNode => {
    const existing = keptFrom.get(node.id);

    return {
      id: node.id,
      type: node.type,
      position: positions.get(node.id)!,
      data: {
        // A new agent asks before using tools that write or are dangerous,
        // like one added from the node selector
        ...(!existing && node.type === "AI_AGENT"
          ? { toolApprovalDefault: TOOL_APPROVAL_DEFAULT_BY_RISK }
          : {}),
        ...(existing?.data ?? {}),
        ...node.data,
      },
    };
  });

  const todo: string[] = [];
  for (const node of nodes) {
    const entry = entryByType.get(node.type);
    if (!entry) continue;

    const needs: string[] = [];
    // An optional credential is needed after all once the node is set to
    // sign in (the HTTP Request's Authentication)
    const signsIn =
      typeof node.data.authentication === "string" &&
      node.data.authentication !== "none";

    if (
      entry.credential &&
      (!entry.credentialOptional || signsIn) &&
      !node.data.credentialId
    ) {
      needs.push("pick a credential");
    }
    // Only for new nodes: a kept one had these filled in already
    if (entry.userConfigured?.length && !keptFrom.has(node.id)) {
      needs.push(`set ${entry.userConfigured.join(", ")}`);
    }

    if (needs.length > 0) todo.push(`${entry.label}: ${needs.join("; ")}`);
  }

  return {
    name: workflow.name,
    summary: workflow.summary,
    nodes,
    edges: real.connections.map((conn) => ({
      id: createId(),
      source: conn.from,
      target: conn.to,
      sourceHandle: conn.fromOutput,
      targetHandle: conn.toInput,
    })),
    todo: [...new Set(todo)],
  };
};
