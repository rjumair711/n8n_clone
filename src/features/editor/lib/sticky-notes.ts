// Sticky notes: notes on the canvas that never run. Stored as nodes of type
// STICKY_NOTE so they are saved, versioned, exported and copied with the
// workflow; the engine, the AI builder and the node counts leave them out.

export const STICKY_NOTE_TYPE = "STICKY_NOTE";

/** Node types that are only on the canvas and are never executed. */
export const CANVAS_ONLY_TYPES = new Set<string>([STICKY_NOTE_TYPE]);

export type StickyNoteData = {
  text?: string;
  color?: string;
  width?: number;
  height?: number;
};

export const STICKY_DEFAULT_SIZE = { width: 240, height: 160 };
export const STICKY_MIN_SIZE = { width: 140, height: 80 };
export const STICKY_MAX_SIZE = { width: 1600, height: 1200 };

export const STICKY_COLORS = [
  { value: "yellow", label: "Yellow", className: "bg-yellow-100 border-yellow-300 text-yellow-950 dark:bg-yellow-900/60 dark:border-yellow-700 dark:text-yellow-50", swatch: "bg-yellow-300" },
  { value: "blue", label: "Blue", className: "bg-sky-100 border-sky-300 text-sky-950 dark:bg-sky-900/60 dark:border-sky-700 dark:text-sky-50", swatch: "bg-sky-300" },
  { value: "green", label: "Green", className: "bg-emerald-100 border-emerald-300 text-emerald-950 dark:bg-emerald-900/60 dark:border-emerald-700 dark:text-emerald-50", swatch: "bg-emerald-300" },
  { value: "pink", label: "Pink", className: "bg-pink-100 border-pink-300 text-pink-950 dark:bg-pink-900/60 dark:border-pink-700 dark:text-pink-50", swatch: "bg-pink-300" },
  { value: "gray", label: "Gray", className: "bg-muted border-border text-foreground", swatch: "bg-gray-300" },
] as const;

export const stickyColor = (value: string | undefined) =>
  STICKY_COLORS.find((color) => color.value === value) ?? STICKY_COLORS[0];

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.max(Math.round(n), min), max) : fallback;
};

/** The note's size from its data, within sensible bounds. */
export const stickySize = (data: StickyNoteData | undefined) => ({
  width: clamp(data?.width, STICKY_MIN_SIZE.width, STICKY_MAX_SIZE.width, STICKY_DEFAULT_SIZE.width),
  height: clamp(data?.height, STICKY_MIN_SIZE.height, STICKY_MAX_SIZE.height, STICKY_DEFAULT_SIZE.height),
});

/** The data of a new note. */
export const newStickyNote = (): StickyNoteData => ({
  text: "",
  color: STICKY_COLORS[0].value,
  ...STICKY_DEFAULT_SIZE,
});
