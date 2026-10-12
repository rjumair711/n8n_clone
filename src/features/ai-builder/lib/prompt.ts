// "Build with AI": what the model is told. Kept apart from the call itself
// so the wording can be read, and tested, on its own.

import { MAIN_INPUT, MAIN_OUTPUT, type CatalogueNode, type CataloguePort } from "./catalogue";
import type { CheckedWorkflow } from "./workflow";

export const MAX_DESCRIPTION_LENGTH = 2000;
export const MAX_HISTORY = 5;

const isOnly = (ports: CataloguePort[], port: CataloguePort) =>
  ports.length === 1 && ports[0].id === port.id;

/**
 * The catalogue as it is put into the prompt: what the model needs to pick
 * and fill in nodes, without what only the editor uses. A hundred node
 * types are a long prompt, so what most nodes have in common is left out
 * and said once in SYSTEM_PROMPT: a text field's type, the one main input
 * and the one output.
 */
export const toPromptCatalogue = (catalogue: CatalogueNode[]) =>
  catalogue.map(
    ({ category: _category, stringValues: _strings, trigger, inputs, outputs, fields, ...node }) => ({
      ...node,
      ...(trigger ? { trigger } : {}),
      fields: fields.map(({ label: _label, conditional: _conditional, type, ...field }) => ({
        ...field,
        ...(type === "text" ? {} : { type }),
      })),
      ...(trigger || isOnly(inputs, MAIN_INPUT) ? {} : { inputs }),
      ...(isOnly(outputs, MAIN_OUTPUT) ? {} : { outputs }),
    })
  );

const ANSWER_SHAPE = `{
  "name": "a short name for the workflow",
  "summary": "one or two sentences for the user: what the workflow does (or what you changed) and what they still have to fill in",
  "nodes": [
    { "id": "n1", "type": "WEBHOOK_TRIGGER", "data": {} },
    { "id": "n2", "type": "IF", "data": { "conditions": [{ "inputKey": "webhook.body.amount", "operator": "greater_than", "value": "100" }], "combinator": "and" } },
    { "id": "n3", "type": "SLACK", "data": { "variableName": "slack", "content": "Large order: {{webhook.body.amount}}" } }
  ],
  "connections": [
    { "from": "n1", "to": "n2" },
    { "from": "n2", "to": "n3", "fromOutput": "true" }
  ]
}`;

export const SYSTEM_PROMPT = `You build workflows for RXJ, a workflow automation tool that works like n8n. You get a catalogue of the node types that exist and a request. Answer with one JSON object and nothing else: no explanation, no code fence.

# Answer format

${ANSWER_SHAPE}

# Nodes

- Use only node types from the catalogue, with "type" written exactly as there.
- Every workflow needs at least one node with "trigger": true. Pick the trigger that fits the request; use MANUAL_TRIGGER only when nothing else starts the workflow. Nothing can be connected into a trigger.
- "data" holds the node's settings. Use only the fields the catalogue lists for that type, in the type it gives: a field without a "type" is text; "select" and "switch" take one of "options"; "list" takes a JSON array; "json" takes a JSON string; "number" a number; "boolean" true or false. A field with "operations" only applies to those values of "operation".
- Fill in every field marked "required", and whatever else the request needs. Leave the rest out.
- Never write credentials, API keys, tokens, passwords, webhook URLs or secrets into any field, and never invent IDs of things only the user has (a spreadsheet, a database, a chat). "credential" and "userConfigured" say what the user sets up afterwards: leave those out and mention them in "summary".
- Use as few nodes as the request needs.

# Data between nodes

- A node with a "variableName" stores its result under that name. Give every such node its own variableName.
- Later nodes read values with {{variableName.path}}, for example {{myApiCall.httpResponse.data.id}}. "notes" says what a node's result looks like. Insert a whole object or list as JSON with {{json variableName}}.
- Trigger data has fixed names, given in the trigger's "notes" (for example {{webhook.body.email}}).
- Fields that take a path (inputKey, itemsPath) are written without braces: webhook.body.amount.

# Connections

- "from" and "to" are node ids. Connections run forward only: no cycles.
- A node without "outputs" in the catalogue has one output, and a node without "inputs" has one main input (a trigger has none): leave "fromOutput" and "toInput" out for those.
- "fromOutput" is needed when the source node has more than one output; its value is an output id from the catalogue ("outputs", or the rule in "dynamicOutputs").
- "toInput" is needed only for a sub-port: an input whose id starts with "sub-". A node plugged into a sub-port (a chat model, a memory, a tool) is configuration for that node: connect it to that port only, not into the main flow.
- An AI_AGENT needs a model node connected to its "sub-model" port.
- To repeat nodes for every item of a list use a LOOP node: connect the repeated nodes to its "loop" output and what comes afterwards to its "done" output. Do not connect back to the LOOP node.
- Every node has to be connected.

If the request cannot be built completely with the catalogue, build the closest workflow that can be and say in "summary" what is missing.`;

const EDIT_RULES = `The user's current workflow is given below. Answer with the complete workflow after the requested change, in the same format: not a diff.
- Keep every node the request does not affect exactly as it is: same "id", "type" and "data".
- Give new nodes new ids. To replace a node with one of another type, remove it and add a new node with a new id.
- Credentials and secrets are not shown and are kept for the nodes you keep.
- In "summary" say what you changed.`;

/**
 * The first message: the catalogue, the workflow on the canvas when there
 * is one, and the request.
 */
export const buildUserPrompt = ({
  catalogue,
  description,
  current,
  history = [],
}: {
  catalogue: CatalogueNode[];
  description: string;
  // The workflow being edited, as describeCurrentWorkflow() returns it
  current?: Pick<CheckedWorkflow, "nodes" | "connections">;
  // Earlier requests of this session, oldest first
  history?: string[];
}) => {
  const editing = !!current && current.nodes.length > 0;

  return [
    `# Catalogue\n\n${JSON.stringify(toPromptCatalogue(catalogue))}`,
    ...(editing
      ? [`# Current workflow\n\n${EDIT_RULES}\n\n${JSON.stringify(current)}`]
      : []),
    ...(history.length > 0
      ? [
          `# Earlier requests (already done)\n\n${history
            .slice(-MAX_HISTORY)
            .map((request) => `- ${request}`)
            .join("\n")}`,
        ]
      : []),
    `# ${editing ? "Change to make" : "Workflow to build"}\n\n${description.trim()}`,
  ].join("\n\n");
};

/**
 * The second message, when the first answer did not pass the check.
 */
export const buildRetryPrompt = (errors: string[]) =>
  `That answer cannot be used:\n\n${errors
    .slice(0, 20)
    .map((error) => `- ${error}`)
    .join("\n")}\n\nAnswer again with the complete corrected JSON object and nothing else.`;
