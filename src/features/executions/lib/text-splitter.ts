import { splitText } from "./ai-fields";

// How text is cut into chunks before it is embedded. Pure functions, shared
// by the Vector Store's Insert and the Document Loader.

export const SPLIT_MODES = [
  { value: "characters", label: "Characters" },
  { value: "tokens", label: "Tokens (approximate)" },
  { value: "markdown", label: "Markdown headings" },
];

export type SplitMode = "characters" | "tokens" | "markdown";

// No tokenizer is bundled, and every embedding model counts differently.
// Four characters per token is the usual estimate for English; text in
// Urdu, Arabic or Chinese makes more tokens than this assumes.
export const CHARACTERS_PER_TOKEN = 4;

export const DEFAULT_CHUNK_SIZE: Record<SplitMode, number> = {
  characters: 1000,
  tokens: 250,
  markdown: 1000,
};

export const DEFAULT_CHUNK_OVERLAP: Record<SplitMode, number> = {
  characters: 100,
  tokens: 25,
  markdown: 100,
};

export type TextChunk = {
  content: string;
  // Markdown mode: the headings the chunk sits under, "Guide > Returns"
  heading?: string;
};

export const resolveSplitMode = (value: unknown): SplitMode =>
  value === "tokens" || value === "markdown" ? value : "characters";

const positive = (value: unknown, fallback: number) => {
  const number = Math.floor(Number(value));

  return Number.isFinite(number) && number > 0 ? number : fallback;
};

type Section = { path: string[]; lines: string[] };

/**
 * The sections of a Markdown text: the lines under each heading, with the
 * headings above it. A "#" inside a code block is not a heading.
 */
export const readMarkdownSections = (text: string): Section[] => {
  const sections: Section[] = [];
  // The current heading of each level, 1 to 6
  const levels: (string | undefined)[] = [];
  let current: Section = { path: [], lines: [] };
  let fence: string | null = null;

  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const fenced = /^\s{0,3}(```+|~~~+)/.exec(line)?.[1];

    if (fenced) {
      // A block closes with the kind of fence that opened it
      if (!fence) fence = fenced[0];
      else if (fenced[0] === fence) fence = null;
    }

    const heading = fence || fenced ? null : /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);

    if (!heading) {
      current.lines.push(line);
      continue;
    }

    sections.push(current);

    const level = heading[1].length;
    levels[level - 1] = heading[2].trim();
    levels.length = level;

    current = {
      path: levels.filter((title): title is string => !!title),
      lines: [],
    };
  }

  sections.push(current);

  return sections;
};

/**
 * Cuts text into chunks.
 *
 *   characters  chunks of `chunkSize` characters with `chunkOverlap` shared
 *               between neighbours, broken at paragraph or sentence ends
 *   tokens      the same, with both numbers counted in (estimated) tokens
 *   markdown    one or more chunks per heading; each starts with the
 *               headings it sits under, so it still says what it is about.
 *               A section longer than `chunkSize` characters is cut further.
 */
export const splitDocument = (
  text: string,
  options: { mode?: unknown; chunkSize?: unknown; chunkOverlap?: unknown } = {}
): TextChunk[] => {
  const mode = resolveSplitMode(options.mode);
  const size = positive(options.chunkSize, DEFAULT_CHUNK_SIZE[mode]);
  // Zero is a real choice: no overlap
  const overlapText = String(options.chunkOverlap ?? "").trim();
  const overlap =
    overlapText === "" || !Number.isFinite(Number(overlapText))
      ? DEFAULT_CHUNK_OVERLAP[mode]
      : Math.max(Math.floor(Number(overlapText)), 0);

  if (mode === "tokens") {
    return splitText(text, size * CHARACTERS_PER_TOKEN, overlap * CHARACTERS_PER_TOKEN).map(
      (content) => ({ content })
    );
  }

  if (mode === "characters") {
    return splitText(text, size, overlap).map((content) => ({ content }));
  }

  const chunks: TextChunk[] = [];

  for (const section of readMarkdownSections(text)) {
    const body = section.lines.join("\n").trim();
    // A heading with nothing under it only names what follows
    if (!body) continue;

    const heading = section.path.join(" > ");

    if (!heading) {
      chunks.push(...splitText(body, size, overlap).map((content) => ({ content })));
      continue;
    }

    // The headings are part of the chunk, so they count toward its size
    const room = Math.max(size - heading.length - 2, 100);

    for (const part of splitText(body, room, Math.min(overlap, room - 50))) {
      chunks.push({ content: `${heading}\n\n${part}`, heading });
    }
  }

  return chunks;
};
