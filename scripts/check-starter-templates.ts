// Checks every starter template (src/features/templates/seed/) in every
// language against the real node registry, the same way "Build with AI"
// checks a workflow before it is put in the editor: each node type exists,
// operations and settings are valid, required settings are there, and the
// connections use ports the nodes have. Then it builds the editor's nodes
// and edges from it.
//
// A required setting saved as "" is one the user fills in (a Phone Number
// ID, a Chat ID, a file); it is listed, not counted as an error. A required
// setting that is missing altogether is an error.
//
//   npx tsx scripts/check-starter-templates.ts
//
// Plain tsx, not --conditions=react-server: the node registry is browser
// code (React components). No database, no network.

import Module from "node:module";

// The registry imports stylesheets; Node cannot load them
(Module as unknown as { _extensions: Record<string, () => void> })._extensions[".css"] = () => {};

const main = async () => {
  const { getNodeCatalogue } = await import("@/features/ai-builder/components/node-catalogue");
  const { checkGeneratedWorkflow, toEditorGraph } = await import("@/features/ai-builder/lib/workflow");
  const { buildStarterTemplates } = await import("@/features/templates/lib/starter-templates");
  const { getTemplateMinPlan } = await import("@/features/templates/lib/template-data");
  const { nodeComponents } = await import("@/config/node-components");

  const catalogue = getNodeCatalogue();
  const starters = buildStarterTemplates();
  const failures: string[] = [];
  let userFields = 0;

  for (const starter of starters) {
    const label = `${starter.key} (${starter.language})`;

    for (const node of starter.nodes) {
      if (!(node.type in nodeComponents)) failures.push(`${label}: ${node.type} has no editor component`);
    }

    // The plan the seed declares is the one its nodes need
    const needed = getTemplateMinPlan("FREE", starter.nodeTypes);
    if (needed !== starter.minPlan) {
      failures.push(`${label}: declares ${starter.minPlan}, its nodes need ${needed}`);
    }

    const raw = {
      name: starter.name,
      nodes: starter.nodes.map((node) => ({ id: node.id, type: node.type, data: node.data })),
      connections: starter.connections.map((conn) => ({
        from: conn.fromNodeId,
        to: conn.toNodeId,
        fromOutput: conn.fromOutput,
        toInput: conn.toInput,
      })),
    };

    const { workflow, errors } = checkGeneratedWorkflow(raw, catalogue);

    for (const error of errors) {
      const required = /"([A-Za-z]+)" is required\./.exec(error);
      // The error names the node in quotes ("..._load" is not "..._loader")
      const node = starter.nodes.find((entry) => error.includes(`"${entry.id}"`));

      // Left empty on purpose for the user to fill in
      if (required && node && node.data[required[1]] === "") {
        userFields++;
        continue;
      }

      failures.push(`${label}: ${error}`);
    }

    if (workflow) {
      let next = 0;
      const graph = toEditorGraph({ workflow, catalogue, createId: () => `n${++next}` });

      if (graph.nodes.length !== starter.nodes.length) {
        failures.push(`${label}: the editor got ${graph.nodes.length} of ${starter.nodes.length} nodes`);
      }
      if (graph.edges.length !== starter.connections.length) {
        failures.push(`${label}: the editor got ${graph.edges.length} of ${starter.connections.length} connections`);
      }
    }
  }

  console.log(
    `${starters.length} starter templates checked against ${catalogue.length} node types; ` +
      `${userFields} settings left for the user to fill in.`
  );

  if (failures.length > 0) {
    console.error(failures.join("\n"));
    console.error(`${failures.length} problem(s)`);
    process.exit(1);
  }

  console.log("All valid.");
  process.exit(0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
