"use client";

// The node catalogue of "Build with AI", made from the node registry. It
// lives in the browser because the registry does: the registry's entries
// are React components. Import it with `await import()`, so a page only
// loads every node when the user actually builds something.

import { nodeComponents } from "@/config/node-components";
import { NODE_SECTIONS } from "@/components/node-selector";
import type { IntegrationConfig } from "@/features/executions/components/integration-dialog";
import { buildNodeCatalogue, type CatalogueNode } from "../lib/catalogue";
import { MANUAL_SPECS } from "../lib/manual-specs";

let catalogue: CatalogueNode[] | undefined;

export const getNodeCatalogue = (): CatalogueNode[] => {
  catalogue ??= buildNodeCatalogue({
    types: Object.keys(nodeComponents),
    options: NODE_SECTIONS.flatMap((section) =>
      section.data.map((option) => ({
        type: option.type,
        label: option.label,
        description: option.description,
        category: section.title,
      }))
    ),
    // createIntegrationNode leaves each node's config on its component
    configs: Object.fromEntries(
      Object.entries(nodeComponents).map(([type, component]) => [
        type,
        (component as { integrationConfig?: IntegrationConfig }).integrationConfig,
      ])
    ),
    manual: MANUAL_SPECS,
  });

  return catalogue;
};
