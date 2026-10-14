// The parts of the vision helpers that the node editor (browser code) needs.
// No server imports here: lib/vision.ts loads sharp and unpdf, and is
// marked "server-only".

export type AnalyzeMode = "extract_text" | "extract_fields" | "describe";

export const ANALYZE_MODES: { value: AnalyzeMode; label: string }[] = [
  { value: "extract_text", label: "Extract All Text" },
  { value: "extract_fields", label: "Extract Fields" },
  { value: "describe", label: "Describe" },
];

export const isAnalyzeMode = (value: unknown): value is AnalyzeMode =>
  ANALYZE_MODES.some((mode) => mode.value === value);
