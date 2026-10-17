// How often the editor asks for a run's node logs, and when it stops. No
// React: the tests run it too.

const RUNNING_INTERVAL_MS = 500;
// A node paused at a Wait can wait for days: asked less often
const WAITING_INTERVAL_MS = 5_000;
// Nothing running: still asked for a while, because the next node may not
// have started yet. Unchanged for this long, the run is over.
const SETTLED_INTERVAL_MS = 2_000;
export const SETTLE_AFTER_MS = 10_000;
// Never asked for longer than this after the last change
export const GIVE_UP_AFTER_MS = 30 * 60_000;

type NodeRow = { status?: string };

/**
 * When to ask again (ms), or false to stop asking. `lastChangeAt` is when
 * the answer last differed from the one before.
 */
export const getExecutionNodesInterval = (
  data: unknown,
  lastChangeAt: number,
  now: number
): number | false => {
  const sinceChange = now - lastChangeAt;
  if (sinceChange > GIVE_UP_AFTER_MS) return false;

  const rows = Array.isArray(data) ? (data as NodeRow[]) : [];

  if (rows.some((row) => row.status === "RUNNING")) return RUNNING_INTERVAL_MS;
  if (rows.some((row) => row.status === "WAITING")) return WAITING_INTERVAL_MS;

  // Just started: no node has logged yet
  if (rows.length === 0) return sinceChange > SETTLE_AFTER_MS ? false : RUNNING_INTERVAL_MS;

  return sinceChange > SETTLE_AFTER_MS ? false : SETTLED_INTERVAL_MS;
};
