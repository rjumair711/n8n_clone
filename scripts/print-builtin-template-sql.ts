// Prints the INSERT statements that put the built-in templates into the
// template gallery. Run with:
//   npx tsx scripts/print-builtin-template-sql.ts
//
//   npx tsx scripts/print-builtin-template-sql.ts stores
//
// It only prints. The statements belong in a migration (see CLAUDE.md).
// Without an argument every built-in template is printed; "documents"
// prints the group added by prisma/migrations/*_analyze_document, "stores"
// the one added by prisma/migrations/*_shopify_woocommerce, and "starters"
// the starter templates (src/features/templates/seed/) in every language,
// added by prisma/migrations/*_starter_templates_built_in.

import {
  BUILTIN_TEMPLATES,
  DOCUMENT_TEMPLATES,
  STORE_TEMPLATES,
  buildSeedSql,
} from "../src/features/templates/lib/builtin-templates";
import { buildStarterSeedSql } from "../src/features/templates/lib/starter-templates";

const groups = {
  documents: DOCUMENT_TEMPLATES,
  stores: STORE_TEMPLATES,
};

const group = process.argv[2];

if (group === "starters") {
  console.log(buildStarterSeedSql());
} else if (group && !(group in groups)) {
  console.error(`Unknown group "${group}". Use one of: ${[...Object.keys(groups), "starters"].join(", ")}`);
  process.exit(1);
} else {
  console.log(buildSeedSql(group ? groups[group as keyof typeof groups] : BUILTIN_TEMPLATES));
}
