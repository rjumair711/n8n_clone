import { inflateRawSync } from "node:zlib";

// Limits for the files that Extract from File opens. A small upload can be
// built to unpack into gigabytes or to keep a parser busy for minutes;
// these checks run before the document libraries see the file.

const fromEnv = (name: string, fallback: number) => {
  const value = Number(process.env[name]);

  return Number.isFinite(value) && value > 0 ? value : fallback;
};

// XLSX and DOCX are ZIP archives
export const MAX_UNCOMPRESSED_BYTES =
  fromEnv("MAX_UNCOMPRESSED_FILE_MB", 50) * 1024 * 1024;
export const MAX_ZIP_ENTRIES = fromEnv("MAX_ZIP_ENTRIES", 2000);

export const PDF_MAX_PAGES = fromEnv("PDF_MAX_PAGES", 200);
export const PDF_TIME_LIMIT_MS = fromEnv("PDF_EXTRACT_TIMEOUT_SECONDS", 20) * 1000;

// The most rows one CSV file is read into; a node can ask for fewer
export const CSV_MAX_ROWS = fromEnv("CSV_MAX_ROWS", 10_000);

/**
 * A file that is over one of the limits. Its message is written for the
 * user and is shown as it is; other errors mean "this is not that kind of
 * file".
 */
export class FileLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileLimitError";
  }
}

const megabytes = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_FILE_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;

const METHOD_STORED = 0;
const METHOD_DEFLATED = 8;

/**
 * Checks a ZIP archive (an XLSX or DOCX file) before it is opened: how many
 * entries it has and how large they are once unpacked. The sizes written in
 * the archive can lie, so every entry is actually unpacked here, with the
 * output capped: a zip bomb is stopped at the limit instead of filling the
 * memory.
 *
 * Throws FileLimitError when a limit is passed, and a plain Error when the
 * data is not a readable ZIP archive.
 */
export const inspectZip = (
  data: Uint8Array,
  {
    maxBytes = MAX_UNCOMPRESSED_BYTES,
    maxEntries = MAX_ZIP_ENTRIES,
  }: { maxBytes?: number; maxEntries?: number } = {}
): { entries: number; uncompressedBytes: number } => {
  const buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);

  if (buffer.length < 22) throw new Error("Not a ZIP archive");

  // The directory is at the end, before an optional comment of up to 64 KB
  let end = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(buffer.length - 22 - 0xffff, 0); offset--) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) {
      end = offset;
      break;
    }
  }

  if (end === -1) throw new Error("Not a ZIP archive");

  const entries = buffer.readUInt16LE(end + 10);
  const directoryOffset = buffer.readUInt32LE(end + 16);

  // ZIP64 is for archives over 4 GB or 65,535 entries: never a real document
  if (entries === 0xffff || directoryOffset === 0xffffffff) {
    throw new FileLimitError("the file is a ZIP64 archive, which is too large to open");
  }

  if (entries > maxEntries) {
    throw new FileLimitError(
      `the file contains ${entries} parts; the limit is ${maxEntries}`
    );
  }

  const tooLarge = () =>
    new FileLimitError(
      `the file unpacks to more than ${megabytes(maxBytes)}, which is the limit`
    );

  // First what the archive says about itself: cheap, and enough for an
  // honest file that is simply too big
  const directory: { method: number; compressedSize: number; localOffset: number }[] = [];
  let declared = 0;
  let position = directoryOffset;

  for (let index = 0; index < entries; index++) {
    if (position + 46 > buffer.length || buffer.readUInt32LE(position) !== CENTRAL_FILE_HEADER) {
      throw new Error("The ZIP directory is damaged");
    }

    const compressedSize = buffer.readUInt32LE(position + 20);
    const uncompressedSize = buffer.readUInt32LE(position + 24);
    const localOffset = buffer.readUInt32LE(position + 42);

    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new FileLimitError("the file is a ZIP64 archive, which is too large to open");
    }

    declared += uncompressedSize;
    if (declared > maxBytes) throw tooLarge();

    directory.push({
      method: buffer.readUInt16LE(position + 10),
      compressedSize,
      localOffset,
    });

    position +=
      46 +
      buffer.readUInt16LE(position + 28) +
      buffer.readUInt16LE(position + 30) +
      buffer.readUInt16LE(position + 32);
  }

  // Then what is really inside
  let uncompressedBytes = 0;

  for (const entry of directory) {
    const header = entry.localOffset;

    if (header + 30 > buffer.length || buffer.readUInt32LE(header) !== LOCAL_FILE_HEADER) {
      throw new Error("A ZIP entry is damaged");
    }

    const start =
      header + 30 + buffer.readUInt16LE(header + 26) + buffer.readUInt16LE(header + 28);
    const compressed = buffer.subarray(start, start + entry.compressedSize);

    if (compressed.length !== entry.compressedSize) {
      throw new Error("A ZIP entry is cut short");
    }

    if (entry.method === METHOD_STORED) {
      uncompressedBytes += compressed.length;
    } else if (entry.method === METHOD_DEFLATED) {
      const remaining = maxBytes - uncompressedBytes;

      try {
        // One byte over the budget is enough to know
        uncompressedBytes += inflateRawSync(compressed, {
          maxOutputLength: remaining + 1,
        }).length;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE") {
          throw tooLarge();
        }
        throw new Error("A ZIP entry could not be unpacked");
      }
    } else {
      throw new Error(`Unsupported ZIP compression method ${entry.method}`);
    }

    if (uncompressedBytes > maxBytes) throw tooLarge();
  }

  return { entries, uncompressedBytes };
};
