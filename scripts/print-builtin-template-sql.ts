// Prints the INSERT statements that put the built-in templates into the
// template gallery. Run with:
//   npx tsx scripts/print-builtin-template-sql.ts
//
//   npx tsx scripts/print-builtin-template-sql.ts stores
//
// It only prints. The statements belong in a migration (see CLAUDE.md).
// Without an argument every template is printed; "documents" prints the
// group added by prisma/migrations/*_analyze_document and "stores" the one
// added by prisma/migrations/*_shopify_woocommerce.

import {
  BUILTIN_TEMPLATES,
  DOCUMENT_TEMPLATES,
  STORE_TEMPLATES,
  buildSeedSql,
} from "../src/features/templates/lib/builtin-templates";

const groups = {
  documents: DOCUMENT_TEMPLATES,
  stores: STORE_TEMPLATES,
};

const group = process.argv[2];

if (group && !(group in groups)) {
  console.error(`Unknown group "${group}". Use one of: ${Object.keys(groups).join(", ")}`);
  process.exit(1);
}

console.log(buildSeedSql(group ? groups[group as keyof typeof groups] : BUILTIN_TEMPLATES));
