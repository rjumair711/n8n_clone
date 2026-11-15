// Undo and redo for the canvas: snapshots of the nodes and connections taken
// before each change. Pure, so it can be tested; the editor keeps one in a
// ref. Like n8n, the history lives only until the page is left, and Save
// is still what stores the workflow.

export const CANVAS_HISTORY_LIMIT = 50;

export type CanvasSnapshot<N, E> = { nodes: N[]; edges: E[] };

export type CanvasHistory<N, E> = {
  past: CanvasSnapshot<N, E>[];
  future: CanvasSnapshot<N, E>[];
};

export const emptyHistory = <N, E>(): CanvasHistory<N, E> => ({ past: [], future: [] });

/** Before a change: remember how the canvas was. A new change ends redo. */
export const recordChange = <N, E>(
  history: CanvasHistory<N, E>,
  before: CanvasSnapshot<N, E>,
  limit = CANVAS_HISTORY_LIMIT,
): CanvasHistory<N, E> => {
  const last = history.past[history.past.length - 1];
  // The same state twice (two handlers for one change) is kept once
  if (last && last.nodes === before.nodes && last.edges === before.edges) {
    return { past: history.past, future: [] };
  }
  return { past: [...history.past, before].slice(-limit), future: [] };
};

export const undoChange = <N, E>(
  history: CanvasHistory<N, E>,
  current: CanvasSnapshot<N, E>,
): { history: CanvasHistory<N, E>; snapshot: CanvasSnapshot<N, E> | null } => {
  const previous = history.past[history.past.length - 1];
  if (!previous) return { history, snapshot: null };
  return {
    history: { past: history.past.slice(0, -1), future: [current, ...history.future] },
    snapshot: previous,
  };
};

export const redoChange = <N, E>(
  history: CanvasHistory<N, E>,
  current: CanvasSnapshot<N, E>,
): { history: CanvasHistory<N, E>; snapshot: CanvasSnapshot<N, E> | null } => {
  const next = history.future[0];
  if (!next) return { history, snapshot: null };
  return {
    history: { past: [...history.past, current], future: history.future.slice(1) },
    snapshot: next,
  };
};

type Change = { type: string; dragging?: boolean };

/**
 * Whether a batch of React Flow changes is worth an undo step. Selecting
 * and measuring are not; a drag counts once, when it starts.
 */
export const isUndoableChange = (changes: Change[], dragInProgress: boolean): boolean =>
  changes.some(
    (change) =>
      change.type === "add" ||
      change.type === "remove" ||
      change.type === "replace" ||
      (change.type === "position" && change.dragging === true && !dragInProgress),
  );

/** Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl+Y, but not while typing. */
export const historyShortcut = (event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey?: boolean;
  typing: boolean;
}): "undo" | "redo" | null => {
  if (event.typing || event.altKey || !(event.ctrlKey || event.metaKey)) return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y" && !event.shiftKey) return "redo";
  return null;
};
