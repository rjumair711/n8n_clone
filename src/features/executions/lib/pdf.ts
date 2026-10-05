import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import bidiFactory from "bidi-js";
import {
  PDFDocument,
  PDFHexString,
  StandardFonts,
  beginText,
  endText,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  rotateAndSkewTextRadiansAndTranslate,
  setFillingColor,
  setFontAndSize,
  showText,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

// The PDF Generator's writer.
//
// Plain Latin text uses the fonts built into every PDF reader, which keeps
// the file tiny. Anything else switches to embedded Noto fonts:
//   - Noto Sans for Latin, Cyrillic, Greek and Vietnamese
//   - Noto Naskh Arabic for Arabic, Urdu, Persian, Pashto and Sindhi
// Arabic-script text is shaped by the font engine (letters joined, dots and
// vowel marks placed by the font's own positioning rules) and laid out
// right to left with the Unicode bidirectional algorithm, so a line can mix
// Urdu with numbers or English.
//
// Other scripts (Chinese, Japanese, Korean, Devanagari, emoji...) have no
// font here and are rejected with a clear error.

export const PDF_PAGE_SIZES = {
  A4: [595.28, 841.89],
  Letter: [612, 792],
} as const;

export type PdfPageSize = keyof typeof PDF_PAGE_SIZES;

const MARGIN = 56;
const MAX_PDF_PAGES = 200;

// The .ttf files live in /assets/fonts (see next.config.ts, which ships
// them with the server function that runs workflows)
const FONT_DIRECTORY = path.join(process.cwd(), "assets", "fonts");

const fontCache = new Map<string, Promise<Uint8Array>>();

const loadFontFile = (name: string) => {
  if (!fontCache.has(name)) {
    fontCache.set(
      name,
      readFile(path.join(FONT_DIRECTORY, name)).catch((error) => {
        fontCache.delete(name);
        throw new Error(
          `The font file ${name} is missing from assets/fonts (${error.code ?? error.message})`
        );
      })
    );
  }

  return fontCache.get(name)!;
};

const bidi = bidiFactory();

// Arabic and its extensions, the presentation forms, and the zero-width
// (non-)joiners that control how Persian and Urdu letters connect
const isArabicCode = (code: number) =>
  (code >= 0x0600 && code <= 0x06ff) ||
  (code >= 0x0750 && code <= 0x077f) ||
  (code >= 0x08a0 && code <= 0x08ff) ||
  (code >= 0xfb50 && code <= 0xfdff) ||
  (code >= 0xfe70 && code <= 0xfeff) ||
  code === 0x200c ||
  code === 0x200d;

// Direction marks and embeddings: invisible, and the layout below works out
// direction by itself
const isBidiControl = (code: number) =>
  code === 0x200e ||
  code === 0x200f ||
  code === 0x061c ||
  (code >= 0x202a && code <= 0x202e) ||
  (code >= 0x2066 && code <= 0x2069);

// The font engine's view of a font: turns text into positioned glyphs
type ShapingFont = {
  unitsPerEm: number;
  layout: (text: string) => {
    glyphs: { id: number }[];
    positions: { xAdvance: number; xOffset: number; yOffset: number }[];
  };
};

type FontSet = {
  // Picks the font that can draw one character
  pick: (code: number, bold: boolean) => PDFFont;
  // For Arabic-script fonts: the engine that shapes their text
  shaper: (font: PDFFont) => ShapingFont | undefined;
  // False for the built-in fonts, which need no direction handling
  bidirectional: boolean;
  supports: (code: number) => boolean;
};

// One glyph of shaped text, in points relative to the start of its piece
type PlacedGlyph = { id: number; x: number; y: number };

type Segment = {
  text: string;
  font: PDFFont;
  width: number;
  // Shaped pieces are drawn glyph by glyph. pdf-lib's own text drawing
  // only uses glyph widths, which leaves the dots of Arabic letters in the
  // wrong place.
  glyphs?: PlacedGlyph[];
};

type Line = {
  segments: Segment[];
  width: number;
  size: number;
  rightToLeft: boolean;
  // Space above, in points
  before: number;
  indent: number;
  rule?: boolean;
};

const reverse = (text: string) => [...text].reverse().join("");

/**
 * Puts one line of text into the order it is drawn in, split into pieces
 * that each use a single font.
 */
const layoutLine = (
  text: string,
  fonts: FontSet,
  bold: boolean,
  size: number
): { segments: Segment[]; width: number; rightToLeft: boolean } => {
  if (!text) return { segments: [], width: 0, rightToLeft: false };

  if (!fonts.bidirectional) {
    const font = fonts.pick(0x41, bold);

    const width = font.widthOfTextAtSize(text, size);

    return { segments: [{ text, font, width }], width, rightToLeft: false };
  }

  const embedding = bidi.getEmbeddingLevels(text);
  const levels = embedding.levels;
  const rightToLeft = (embedding.paragraphs[0]?.level ?? 0) % 2 === 1;

  // Character positions in the order they appear on the page
  const order = Array.from({ length: text.length }, (_, index) => index);
  for (const [start, end] of bidi.getReorderSegments(text, embedding)) {
    const flipped = order.slice(start, end + 1).reverse();
    order.splice(start, flipped.length, ...flipped);
  }

  // Neighbouring characters that share a font and a direction form a piece
  const pieces: { indexes: number[]; font: PDFFont; arabic: boolean; odd: boolean }[] = [];

  for (const index of order) {
    const code = text.charCodeAt(index);
    const arabic = isArabicCode(code);
    const font = fonts.pick(code, bold);
    const odd = levels[index] % 2 === 1;
    const last = pieces[pieces.length - 1];

    if (
      last &&
      last.font === font &&
      last.odd === odd &&
      Math.abs(last.indexes[last.indexes.length - 1] - index) === 1
    ) {
      last.indexes.push(index);
    } else {
      pieces.push({ indexes: [index], font, arabic, odd });
    }
  }

  const segments = pieces.map((piece): Segment => {
    const visual = piece.indexes.map((index) => text[index]).join("");

    const shaper = piece.arabic ? fonts.shaper(piece.font) : undefined;

    if (shaper) {
      // The font engine joins the letters and reverses the piece itself, so
      // it gets right-to-left text in reading order. Arabic-Indic digits
      // run left to right; reversing them first cancels the engine's flip.
      const logical = reverse(visual);
      const run = shaper.layout(logical);
      const scale = size / shaper.unitsPerEm;

      let pen = 0;
      const glyphs = run.glyphs.map((glyph, index): PlacedGlyph => {
        const position = run.positions[index];
        const placed = {
          id: glyph.id,
          x: pen + position.xOffset * scale,
          y: position.yOffset * scale,
        };

        pen += position.xAdvance * scale;

        return placed;
      });

      return { text: logical, font: piece.font, width: pen, glyphs };
    }

    // Brackets and quotes inside right-to-left text face the other way
    const drawn = piece.odd
      ? [...visual].map((char) => bidi.getMirroredCharacter(char) ?? char).join("")
      : visual;

    return {
      text: drawn,
      font: piece.font,
      width: piece.font.widthOfTextAtSize(drawn, size),
    };
  });

  return {
    segments,
    width: segments.reduce((total, segment) => total + segment.width, 0),
    rightToLeft,
  };
};

/**
 * Makes a PDF from plain text with light formatting: lines starting with
 * "# ", "## " or "### " are headings, "- " or "* " are bullets, "---" is a
 * rule, and an empty line separates paragraphs.
 */
export const generatePdf = async ({
  title,
  content,
  pageSize = "A4",
  fontSize = 11,
}: {
  title?: string;
  content: string;
  pageSize?: PdfPageSize;
  fontSize?: number;
}): Promise<{ bytes: Uint8Array; pages: number }> => {
  const document = await PDFDocument.create();

  const [pageWidth, pageHeight] = PDF_PAGE_SIZES[pageSize] ?? PDF_PAGE_SIZES.A4;
  const bodySize = Math.min(Math.max(Number(fontSize) || 11, 6), 36);
  const usableWidth = pageWidth - MARGIN * 2;

  // Tabs and non-breaking spaces become spaces; direction marks are dropped
  const normalize = (text: string) =>
    [...text]
      .filter((char) => !isBidiControl(char.codePointAt(0) ?? 0))
      .map((char) => (char === "\t" ? "    " : char.codePointAt(0) === 0xa0 ? " " : char))
      .join("");

  const cleanTitle = normalize(title?.trim() ?? "");
  const cleanContent = normalize(content.replace(/\r\n/g, "\n"));

  // -------------------------------------------------------------------
  // FONTS
  // -------------------------------------------------------------------
  const helvetica = await document.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await document.embedFont(StandardFonts.HelveticaBold);

  const builtInCanDraw = (char: string) => {
    try {
      helvetica.encodeText(char);
      return true;
    } catch {
      return false;
    }
  };

  const characters = new Set([...cleanTitle, ...cleanContent].filter((char) => char !== "\n"));
  const needsUnicodeFonts = [...characters].some((char) => !builtInCanDraw(char));

  let fonts: FontSet;

  if (!needsUnicodeFonts) {
    fonts = {
      pick: (_code, bold) => (bold ? helveticaBold : helvetica),
      shaper: () => undefined,
      bidirectional: false,
      supports: () => true,
    };
  } else {
    document.registerFontkit(fontkit);

    const hasArabic = [...characters].some((char) => isArabicCode(char.codePointAt(0) ?? 0));

    const [sans, sansBold] = await Promise.all([
      document.embedFont(await loadFontFile("NotoSans-Regular.ttf"), { subset: true }),
      document.embedFont(await loadFontFile("NotoSans-Bold.ttf"), { subset: true }),
    ]);

    // Embedded whole, not as a subset: its glyphs are drawn by their
    // original numbers, which a subset would renumber
    const naskhFiles = hasArabic
      ? await Promise.all([
          loadFontFile("NotoNaskhArabic-Regular.ttf"),
          loadFontFile("NotoNaskhArabic-Bold.ttf"),
        ])
      : [];

    const [naskh, naskhBold] = hasArabic
      ? await Promise.all(naskhFiles.map((file) => document.embedFont(file)))
      : [sans, sansBold];

    const shapers = new Map<PDFFont, ShapingFont>(
      hasArabic
        ? [
            [naskh, fontkit.create(naskhFiles[0]) as unknown as ShapingFont],
            [naskhBold, fontkit.create(naskhFiles[1]) as unknown as ShapingFont],
          ]
        : []
    );

    const sansCharacters = new Set(sans.getCharacterSet());
    const naskhCharacters = new Set(naskh.getCharacterSet());

    fonts = {
      pick: (code, bold) =>
        isArabicCode(code) ? (bold ? naskhBold : naskh) : bold ? sansBold : sans,
      shaper: (font) => shapers.get(font),
      bidirectional: true,
      supports: (code) =>
        isArabicCode(code)
          ? // The joiners have no glyph of their own; they only steer shaping
            code === 0x200c || code === 0x200d || naskhCharacters.has(code)
          : sansCharacters.has(code),
    };

    const unsupported = [...characters].filter(
      (char) => !fonts.supports(char.codePointAt(0) ?? 0)
    );

    if (unsupported.length > 0) {
      throw new Error(
        `The text contains characters the PDF fonts cannot draw (${unsupported.slice(0, 8).join(" ")}). Latin, Cyrillic, Greek, Arabic, Urdu and Persian text is supported.`
      );
    }
  }

  // -------------------------------------------------------------------
  // LINES
  // -------------------------------------------------------------------
  const lines: Line[] = [];

  const measure = (text: string, bold: boolean, size: number) =>
    layoutLine(text, fonts, bold, size).width;

  // Breaks a paragraph into lines that fit; a word wider than the page
  // (a long URL) is cut
  const wrap = (text: string, bold: boolean, size: number, width: number) => {
    const wrapped: string[] = [];
    let line = "";

    for (let word of text.split(/\s+/).filter(Boolean)) {
      while (measure(word, bold, size) > width && word.length > 1) {
        let cut = word.length - 1;
        while (cut > 1 && measure(word.slice(0, cut), bold, size) > width) cut--;

        if (line) {
          wrapped.push(line);
          line = "";
        }
        wrapped.push(word.slice(0, cut));
        word = word.slice(cut);
      }

      const candidate = line ? `${line} ${word}` : word;

      if (measure(candidate, bold, size) <= width) {
        line = candidate;
      } else {
        wrapped.push(line);
        line = word;
      }
    }

    if (line) wrapped.push(line);

    return wrapped;
  };

  const addBlock = (
    text: string,
    style: { size: number; bold: boolean; before: number; indent?: number; bullet?: boolean }
  ) => {
    const indent = style.indent ?? 0;
    const bulletIndent = style.bullet ? 12 : 0;

    wrap(text, style.bold, style.size, usableWidth - indent - bulletIndent).forEach(
      (line, index) => {
        const withBullet = style.bullet && index === 0 ? `• ${line}` : line;

        lines.push({
          ...layoutLine(withBullet, fonts, style.bold, style.size),
          size: style.size,
          before: index === 0 ? style.before : 0,
          // Continuation lines of a bullet line up with its text
          indent: style.bullet && index > 0 ? indent + bulletIndent : indent,
        });
      }
    );
  };

  if (cleanTitle) {
    addBlock(cleanTitle, { size: bodySize * 1.9, bold: true, before: 0 });
  }

  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    addBlock(paragraph.join(" "), { size: bodySize, bold: false, before: bodySize * 0.8 });
    paragraph = [];
  };

  for (const rawLine of cleanContent.split("\n")) {
    const line = rawLine.trim();
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    const bullet = line.match(/^[-*]\s+(.*)$/);

    if (!line) {
      flushParagraph();
    } else if (/^-{3,}$/.test(line)) {
      flushParagraph();
      lines.push({
        segments: [],
        width: 0,
        rightToLeft: false,
        size: bodySize,
        before: bodySize,
        indent: 0,
        rule: true,
      });
    } else if (heading) {
      flushParagraph();
      const scale = [1.6, 1.35, 1.15][heading[1].length - 1];
      addBlock(heading[2], { size: bodySize * scale, bold: true, before: bodySize * 1.4 });
    } else if (bullet) {
      flushParagraph();
      addBlock(bullet[1], {
        size: bodySize,
        bold: false,
        before: bodySize * 0.35,
        indent: 10,
        bullet: true,
      });
    } else {
      paragraph.push(line);
    }
  }
  flushParagraph();

  // -------------------------------------------------------------------
  // PAGES
  // -------------------------------------------------------------------
  let page: PDFPage = document.addPage([pageWidth, pageHeight]);
  let y = pageHeight - MARGIN;

  for (const line of lines) {
    // Arabic-script lines are taller: their letters reach further down
    const lineHeight = line.size * (fonts.bidirectional ? 1.6 : 1.35);

    if (y - line.before - lineHeight < MARGIN) {
      if (document.getPageCount() >= MAX_PDF_PAGES) {
        throw new Error(`The document is longer than ${MAX_PDF_PAGES} pages`);
      }
      page = document.addPage([pageWidth, pageHeight]);
      y = pageHeight - MARGIN;
    } else {
      y -= line.before;
    }

    y -= lineHeight;

    if (line.rule) {
      page.drawLine({
        start: { x: MARGIN, y: y + lineHeight / 2 },
        end: { x: pageWidth - MARGIN, y: y + lineHeight / 2 },
        thickness: 0.7,
        color: rgb(0.6, 0.6, 0.6),
      });
      continue;
    }

    // Right-to-left lines start at the right margin
    let x = line.rightToLeft
      ? pageWidth - MARGIN - line.indent - line.width
      : MARGIN + line.indent;

    const baseline = y + line.size * 0.35;
    const color = rgb(0.1, 0.1, 0.1);

    for (const segment of line.segments) {
      if (segment.glyphs) {
        // Each glyph goes exactly where the font engine put it
        const fontKey = page.node.newFontDictionary(
          segment.font.name,
          segment.font.ref
        );

        page.pushOperators(
          pushGraphicsState(),
          beginText(),
          setFillingColor(color),
          setFontAndSize(fontKey, line.size),
          ...segment.glyphs.flatMap((glyph) => [
            rotateAndSkewTextRadiansAndTranslate(0, 0, 0, x + glyph.x, baseline + glyph.y),
            showText(PDFHexString.of(glyph.id.toString(16).padStart(4, "0"))),
          ]),
          endText(),
          popGraphicsState()
        );
      } else {
        page.drawText(segment.text, {
          x,
          y: baseline,
          size: line.size,
          font: segment.font,
          color,
        });
      }

      x += segment.width;
    }
  }

  if (cleanTitle) document.setTitle(cleanTitle);
  document.setCreator("RXJ Workflows");

  return { bytes: await document.save(), pages: document.getPageCount() };
};
