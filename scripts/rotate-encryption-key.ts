// Re-encrypts every stored credential (API keys, logins, and the OAuth
// tokens of Google and Salesforce accounts, which are credentials too) with
// the current ENCRYPTION_KEY.
//
//   npx tsx scripts/rotate-encryption-key.ts --dry-run   (changes nothing)
//   npx tsx scripts/rotate-encryption-key.ts
//
// To change the key: put the old key in ENCRYPTION_KEY_PREVIOUS and the new
// one in ENCRYPTION_KEY, deploy, run this, and remove
// ENCRYPTION_KEY_PREVIOUS once it reports nothing left. The steps are in
// README.md.
//
// It also brings values in the older, unversioned format to the "v1:"
// format. Rows that are already current are skipped, so it is safe to stop
// and run again.

import { PrismaClient } from "@prisma/client";
import { getEncryptionSecrets } from "../src/lib/encryption";
import { rotateEncryptedRows } from "../src/lib/encryption-rotation";

const BATCH_SIZE = 100;

const main = async () => {
  // Outside Next.js nothing reads .env for us. Variables that are already
  // set (as on a server) win; no .env file is fine too.
  try {
    process.loadEnvFile(".env");
  } catch {
    // No .env file: the environment has to provide the variables
  }

  const dryRun = process.argv.includes("--dry-run");

  // Fails here, before touching anything, when ENCRYPTION_KEY is missing
  const secrets = getEncryptionSecrets();

  console.log(
    secrets.length > 1
      ? "Using ENCRYPTION_KEY, and ENCRYPTION_KEY_PREVIOUS to read old values."
      : "Using ENCRYPTION_KEY only (ENCRYPTION_KEY_PREVIOUS is not set)."
  );
  if (dryRun) console.log("Dry run: nothing will be changed.");

  const prisma = new PrismaClient();

  try {
    const result = await rotateEncryptedRows({
      batchSize: BATCH_SIZE,
      dryRun,
      store: {
        readBatch: (afterId, take) =>
          prisma.credential.findMany({
            where: afterId ? { id: { gt: afterId } } : {},
            orderBy: { id: "asc" },
            take,
            select: { id: true, value: true },
          }),
        // Raw, so "updatedAt" keeps its value: the credential did not change
        replaceValue: async (id, oldValue, newValue) =>
          (await prisma.$executeRaw`
            UPDATE "Credential" SET "value" = ${newValue}
            WHERE "id" = ${id} AND "value" = ${oldValue}
          `) === 1,
      },
      onBatch: (progress) => console.log(`  ${progress.total} checked...`),
    });

    console.log(`\nCredentials checked:   ${result.total}`);
    console.log(
      `${dryRun ? "Would be re-encrypted:" : "Re-encrypted:         "} ${result.reencrypted}`
    );
    console.log(`Already current:       ${result.alreadyCurrent}`);
    if (result.skipped) {
      console.log(`Changed meanwhile:     ${result.skipped} (run the script again)`);
    }

    if (result.failedIds.length) {
      console.error(
        `\nCould not be read with the configured keys: ${result.failedIds.length}`
      );
      for (const id of result.failedIds) console.error(`  credential ${id}`);
      console.error(
        "Check ENCRYPTION_KEY_PREVIOUS. Keep it set until this list is empty."
      );
      process.exitCode = 1;
    } else if (!dryRun && !result.skipped) {
      console.log(
        "\nEvery credential is encrypted with the current key. ENCRYPTION_KEY_PREVIOUS can be removed."
      );
    }
  } finally {
    await prisma.$disconnect();
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
