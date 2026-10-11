import { FileLimitError, PDF_TIME_LIMIT_MS } from "./file-limits";

// Turning a file into what a vision model can read: an image as a JPEG of
// a sensible size, and a PDF as its pages. A page of a PDF that has text is
// passed on as that text; a page without any (a scan, a photographed
// document) is passed on as the image it consists of.
//
// Scanned pages are not drawn: that would need a canvas, which the server
// does not have. The picture the scanner put on the page is taken out of
// the PDF as it is, which for a scan is the page.

const fromEnv = (name: string, fallback: number) => {
  const value = Number(process.env[name]);

  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
};

// Pages of a PDF one run of the node reads when nothing else is set, and
// the most a node may be set to
export const VISION_DEFAULT_MAX_PAGES = 5;
export const VISION_MAX_PAGES = fromEnv("VISION_MAX_PDF_PAGES", 20);

// Longest side of an image that is sent to the model, in pixels
export const VISION_IMAGE_MAX_SIDE = 1600;
// A page with fewer characters than this has no real text: it is a scan
export const SCANNED_PAGE_MAX_TEXT_CHARS = 20;
// A scanner may store a page as a few strips; a logo or a line is skipped
const MAX_IMAGES_PER_PAGE = 4;
const MIN_IMAGE_SIDE = 150;
// Largest picture that is decoded, in pixels (about 50 megapixels)
const MAX_INPUT_PIXELS = 50_000_000;
// Text of one page that is passed on
const MAX_PAGE_TEXT_CHARS = 20_000;

export type VisionPart =
  | { type: "text"; text: string }
  | { type: "image"; image: Buffer; mediaType: "image/jpeg" };

export type PreparedDocument = {
  kind: "image" | "pdf";
  parts: VisionPart[];
  // PDF: pages of the file, and how many of them were read
  pages: number;
  pagesRead: number;
  truncated: boolean;
  // How many of the pages that were read were passed on as images
  scannedPages: number;
  images: number;
};

/**
 * The number of pages a node reads: its own setting, at least 1, at most
 * the server's limit.
 */
export const resolveMaxPages = (value: unknown, limit: number = VISION_MAX_PAGES): number => {
  const pages = Math.floor(Number(String(value ?? "").trim()));

  if (!Number.isFinite(pages) || pages < 1) return Math.min(VISION_DEFAULT_MAX_PAGES, limit);

  return Math.min(pages, limit);
};

export const isPdf = (mimeType: string, data: Uint8Array) =>
  mimeType.toLowerCase().startsWith("application/pdf") ||
  Buffer.from(data.subarray(0, 5)).toString("latin1") === "%PDF-";

const loadSharp = async () => (await import("sharp")).default;

/**
 * An image file as a JPEG no larger than the model needs: turned upright,
 * scaled down to 1600 pixels on its longest side, never scaled up. Throws
 * a FileLimitError for a file that is not a picture.
 */
export const prepareImage = async (data: Uint8Array): Promise<Buffer> => {
  const sharp = await loadSharp();

  try {
    return await sharp(Buffer.from(data), { limitInputPixels: MAX_INPUT_PIXELS })
      // Phones store the rotation next to the picture
      .rotate()
      .resize({
        width: VISION_IMAGE_MAX_SIDE,
        height: VISION_IMAGE_MAX_SIDE,
        fit: "inside",
        withoutEnlargement: true,
      })
      // A transparent background would turn black in a JPEG
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch {
    throw new FileLimitError(
      "the file is not an image this node can read. Use a JPEG, PNG, WebP, GIF or TIFF image, or a PDF"
    );
  }
};

// The pixels of a picture inside a PDF, as unpdf returns them
type RawImage = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  channels: 1 | 3 | 4;
};

const encodeRawImage = async (image: RawImage): Promise<Buffer | null> => {
  if (
    image.width < MIN_IMAGE_SIDE ||
    image.height < MIN_IMAGE_SIDE ||
    image.width * image.height > MAX_INPUT_PIXELS
  ) {
    return null;
  }

  const sharp = await loadSharp();

  try {
    return await sharp(
      Buffer.from(image.data.buffer, image.data.byteOffset, image.data.length),
      { raw: { width: image.width, height: image.height, channels: image.channels } }
    )
      .resize({
        width: VISION_IMAGE_MAX_SIDE,
        height: VISION_IMAGE_MAX_SIDE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch {
    // A picture in a form the encoder does not know: the page goes on
    // without it
    return null;
  }
};

/**
 * A PDF as its first `maxPages` pages, in order. Each page is its text, or,
 * for a page without text, the picture(s) it consists of. The whole thing
 * has a time limit, like every other read of a PDF.
 */
export const preparePdf = async (
  data: Uint8Array,
  {
    maxPages = VISION_DEFAULT_MAX_PAGES,
    timeLimitMs = PDF_TIME_LIMIT_MS,
  }: { maxPages?: number; timeLimitMs?: number } = {}
): Promise<PreparedDocument> => {
  const { getDocumentProxy, extractImages } = await import("unpdf");

  const deadline = Date.now() + timeLimitMs;
  const tooSlow = () =>
    new FileLimitError(
      `reading the PDF took longer than ${Math.round(timeLimitMs / 1000)} seconds, which is the limit`
    );

  const withinTimeLimit = async <T,>(work: Promise<T>): Promise<T> => {
    const remaining = deadline - Date.now();

    if (remaining <= 0) {
      work.catch(() => {});
      throw tooSlow();
    }

    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      return await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(tooSlow()), remaining);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };

  // The parser takes ownership of the bytes it is given
  const document = await withinTimeLimit(getDocumentProxy(new Uint8Array(data)));

  try {
    const pages = document.numPages;
    const pagesRead = Math.min(pages, Math.max(maxPages, 1));
    const parts: VisionPart[] = [];
    let scannedPages = 0;
    let images = 0;

    for (let pageNumber = 1; pageNumber <= pagesRead; pageNumber++) {
      const content = await withinTimeLimit(
        document.getPage(pageNumber).then((page) => page.getTextContent())
      );

      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (text.length >= SCANNED_PAGE_MAX_TEXT_CHARS) {
        parts.push({
          type: "text",
          text: `Page ${pageNumber} (text):\n${text.slice(0, MAX_PAGE_TEXT_CHARS)}`,
        });
        continue;
      }

      // No text: a scan. The picture(s) on the page are the page.
      const raw = (await withinTimeLimit(
        extractImages(document, pageNumber)
      )) as RawImage[];

      const encoded: Buffer[] = [];
      for (const image of raw) {
        if (encoded.length >= MAX_IMAGES_PER_PAGE) break;

        const jpeg = await encodeRawImage(image);
        if (jpeg) encoded.push(jpeg);
      }

      if (encoded.length === 0) {
        parts.push({
          type: "text",
          text: `Page ${pageNumber}: ${text || "(nothing on this page could be read)"}`,
        });
        continue;
      }

      scannedPages++;
      images += encoded.length;
      parts.push({ type: "text", text: `Page ${pageNumber} (scanned image):` });
      for (const jpeg of encoded) {
        parts.push({ type: "image", image: jpeg, mediaType: "image/jpeg" });
      }
    }

    return {
      kind: "pdf",
      parts,
      pages,
      pagesRead,
      truncated: pagesRead < pages,
      scannedPages,
      images,
    };
  } finally {
    // Frees the parser's memory, where the document offers a way to
    const closable = document as unknown as {
      destroy?: () => Promise<unknown>;
      cleanup?: () => Promise<unknown>;
    };
    void Promise.resolve()
      .then(() => closable.destroy?.() ?? closable.cleanup?.())
      .catch(() => {});
  }
};

/**
 * A stored file (an image or a PDF) as what is sent to the model.
 */
export const prepareDocument = async (
  file: { mimeType: string; data: Uint8Array },
  options: { maxPages?: number; timeLimitMs?: number } = {}
): Promise<PreparedDocument> => {
  if (isPdf(file.mimeType, file.data)) {
    return preparePdf(file.data, options);
  }

  return {
    kind: "image",
    parts: [
      { type: "image", image: await prepareImage(file.data), mediaType: "image/jpeg" },
    ],
    pages: 1,
    pagesRead: 1,
    truncated: false,
    scannedPages: 0,
    images: 1,
  };
};

export type AnalyzeMode = "extract_text" | "extract_fields" | "describe";

export const ANALYZE_MODES: { value: AnalyzeMode; label: string }[] = [
  { value: "extract_text", label: "Extract All Text" },
  { value: "extract_fields", label: "Extract Fields" },
  { value: "describe", label: "Describe" },
];

export const isAnalyzeMode = (value: unknown): value is AnalyzeMode =>
  ANALYZE_MODES.some((mode) => mode.value === value);
