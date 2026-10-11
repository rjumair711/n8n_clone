// Prints the INSERT statements that put the built-in templates into the
// template gallery. Run with:
//   npx tsx scripts/print-builtin-template-sql.ts
//
// It only prints. The statements belong in a migration (see CLAUDE.md): the
// one that first added them is prisma/migrations/*_analyze_document.

import { buildSeedSql } from "../src/features/templates/lib/builtin-templates";

console.log(buildSeedSql());
