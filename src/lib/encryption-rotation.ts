import { reencrypt } from "./encryption";

// Where the encrypted values live. The script passes the database; the
// tests pass a list in memory.
export type EncryptedRowStore = {
  // The next rows after the given id, ordered by id
  readBatch: (
    afterId: string | null,
    take: number
  ) => Promise<{ id: string; value: string }[]>;
  // Replaces the value only if it is still the one that was read. Returns
  // false when someone changed the row in the meantime.
  replaceValue: (id: string, oldValue: string, newValue: string) => Promise<boolean>;
};

export type RotationResult = {
  total: number;
  // Written again with the current key
  reencrypted: number;
  // Already in the current format with the current key
  alreadyCurrent: number;
  // Changed by someone else while the script ran; a re-run picks them up
  skipped: number;
  // Ids of rows no configured key can read. Never their values.
  failedIds: string[];
};

/**
 * Re-encrypts every stored value with the current ENCRYPTION_KEY, a batch
 * at a time. Rows that are already current are left alone, so it can be
 * stopped and run again; a row that cannot be read is reported and the rest
 * still go through.
 */
export const rotateEncryptedRows = async ({
  store,
  batchSize = 100,
  dryRun = false,
  onBatch,
}: {
  store: EncryptedRowStore;
  batchSize?: number;
  dryRun?: boolean;
  onBatch?: (result: RotationResult) => void;
}): Promise<RotationResult> => {
  const result: RotationResult = {
    total: 0,
    reencrypted: 0,
    alreadyCurrent: 0,
    skipped: 0,
    failedIds: [],
  };

  let afterId: string | null = null;

  for (;;) {
    const rows = await store.readBatch(afterId, batchSize);
    if (rows.length === 0) break;

    for (const row of rows) {
      result.total++;

      let next: string | null;
      try {
        next = reencrypt(row.value);
      } catch {
        result.failedIds.push(row.id);
        continue;
      }

      if (next === null) {
        result.alreadyCurrent++;
      } else if (dryRun || (await store.replaceValue(row.id, row.value, next))) {
        result.reencrypted++;
      } else {
        result.skipped++;
      }
    }

    afterId = rows[rows.length - 1].id;
    onBatch?.(result);
  }

  return result;
};
