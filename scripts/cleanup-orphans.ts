// Finds rows left behind by workflows that were deleted outside the app
// (straight in the database), and Telegram bots whose webhook still points
// at a workflow that no longer exists.
//
//   npx tsx --conditions=react-server scripts/cleanup-orphans.ts --dry-run   (changes nothing)
//   npx tsx --conditions=react-server scripts/cleanup-orphans.ts
//
// Nodes, connections, executions, versions, pinned data, trigger state and
// evaluation datasets go with their workflow by ON DELETE CASCADE, also for
// a delete in the database. What has no foreign key stays behind:
//
//   deleted   agent_memory, agent_memory_summary   (by node id)
//             ChatMessage of a chat widget        ("widget:<node id>:...")
//             vector_document of a chatbot        (collection "chatbot-...")
//                                                 that no node uses any more
//             webhook_delivery                    (duplicate-delivery keys)
//   reported  ai_usage (kept on purpose: the month's AI spend stays complete)
//             workflow_file whose execution is gone
//   Telegram  getWebhookInfo for every Telegram credential (read only); the
//             webhook is removed (deleteWebhook) when it points at a
//             workflow that does not exist. Needs ENCRYPTION_KEY.
//
// The dry run prints the counts and the Telegram report. Without
// --dry-run the same statements delete; running it again finds nothing.

import { CredentialType, PrismaClient } from "@prisma/client";
import { callTelegram } from "../src/lib/telegram";
import { readCredentialValue } from "../src/lib/external-secrets";

type Check = { label: string; count: string; remove?: string };

// Every statement only matches rows whose workflow, node or execution is gone
const CHECKS: Check[] = [
  {
    label: "agent_memory (node gone)",
    count: `SELECT count(*)::int AS n FROM agent_memory t WHERE NOT EXISTS (SELECT 1 FROM "Node" x WHERE x.id = t."nodeId")`,
    remove: `DELETE FROM agent_memory t WHERE NOT EXISTS (SELECT 1 FROM "Node" x WHERE x.id = t."nodeId")`,
  },
  {
    label: "agent_memory_summary (node gone)",
    count: `SELECT count(*)::int AS n FROM agent_memory_summary t WHERE NOT EXISTS (SELECT 1 FROM "Node" x WHERE x.id = t."nodeId")`,
    remove: `DELETE FROM agent_memory_summary t WHERE NOT EXISTS (SELECT 1 FROM "Node" x WHERE x.id = t."nodeId")`,
  },
  {
    label: "ChatMessage of a chat widget (node gone)",
    count: `SELECT count(*)::int AS n FROM "ChatMessage" t WHERE t."sessionId" LIKE 'widget:%' AND NOT EXISTS (SELECT 1 FROM "Node" x WHERE x.id = split_part(t."sessionId", ':', 2))`,
    remove: `DELETE FROM "ChatMessage" t WHERE t."sessionId" LIKE 'widget:%' AND NOT EXISTS (SELECT 1 FROM "Node" x WHERE x.id = split_part(t."sessionId", ':', 2))`,
  },
  {
    label: "vector_document of a chatbot no node uses",
    count: `SELECT count(*)::int AS n FROM vector_document t WHERE t.collection LIKE 'chatbot-%' AND NOT EXISTS (SELECT 1 FROM "Node" x WHERE x.data->>'collection' = t.collection)`,
    remove: `DELETE FROM vector_document t WHERE t.collection LIKE 'chatbot-%' AND NOT EXISTS (SELECT 1 FROM "Node" x WHERE x.data->>'collection' = t.collection)`,
  },
  {
    label: "webhook_delivery (workflow gone)",
    count: `SELECT count(*)::int AS n FROM webhook_delivery t WHERE NOT EXISTS (SELECT 1 FROM "Workflow" w WHERE w.id = t."workflowId")`,
    remove: `DELETE FROM webhook_delivery t WHERE NOT EXISTS (SELECT 1 FROM "Workflow" w WHERE w.id = t."workflowId")`,
  },
  {
    label: "ai_usage of a deleted workflow (kept)",
    count: `SELECT count(*)::int AS n FROM ai_usage t WHERE t."workflowId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Workflow" w WHERE w.id = t."workflowId")`,
  },
  {
    label: "workflow_file whose execution is gone (kept)",
    count: `SELECT count(*)::int AS n FROM workflow_file t WHERE t."executionId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Execution" e WHERE e.id = t."executionId")`,
  },
];

const TELEGRAM_PATH = /\/api\/webhooks\/telegram\/([^/?#]+)/;

const main = async () => {
  try {
    process.loadEnvFile(".env");
  } catch {
    // No .env file: the environment has to provide the variables
  }

  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) console.log("Dry run: nothing will be changed.\n");

  const prisma = new PrismaClient();

  try {
    for (const check of CHECKS) {
      const [{ n }] = await prisma.$queryRawUnsafe<{ n: number }[]>(check.count);
      const action = check.remove && n > 0 && dryRun ? "  (would delete)" : "";
      console.log(`${check.label.padEnd(46)} ${String(n).padStart(6)}${action}`);

      if (!dryRun && check.remove && n > 0) {
        const deleted = await prisma.$executeRawUnsafe(check.remove);
        console.log(`${"".padEnd(46)} deleted ${deleted}`);
      }
    }

    // ---- Telegram ----
    const credentials = await prisma.credential.findMany({
      where: { type: CredentialType.TELEGRAM },
      select: { id: true, name: true, userId: true, value: true },
    });
    console.log(`\nTelegram: ${credentials.length} bot credential(s)`);

    for (const credential of credentials) {
      let url = "";
      let botToken = "";
      try {
        botToken = (await readCredentialValue(credential.value, credential.userId)).trim();
        const info = await callTelegram<{ url?: string }>(botToken, "getWebhookInfo", {});
        url = info?.url ?? "";
      } catch (error) {
        console.log(`  ${credential.id} "${credential.name}": could not ask Telegram (${error instanceof Error ? error.message : "error"})`);
        continue;
      }

      const workflowId = url.match(TELEGRAM_PATH)?.[1];
      if (!workflowId) {
        console.log(`  ${credential.id} "${credential.name}": ${url ? "webhook points elsewhere" : "no webhook"}`);
        continue;
      }

      const exists = await prisma.workflow.findUnique({ where: { id: workflowId }, select: { id: true } });
      if (exists) {
        console.log(`  ${credential.id} "${credential.name}": webhook of workflow ${workflowId} (exists)`);
        continue;
      }

      console.log(`  ${credential.id} "${credential.name}": webhook of DELETED workflow ${workflowId}${dryRun ? " (would remove)" : ""}`);
      if (!dryRun) {
        await callTelegram(botToken, "deleteWebhook", {});
        console.log("    webhook removed");
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(dryRun ? "\nDry run finished." : "\nDone.");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
