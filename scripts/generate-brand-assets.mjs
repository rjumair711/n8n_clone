// Makes the wordmark, favicon and app icons from the RXJ logo.
//
//   node scripts/generate-brand-assets.mjs
//
// The source, public/logos/RXJ.png, is never changed: the files below are
// crops and smaller copies of it. Run this again when the logo changes.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "public/logos/RXJ.png");

// Where the letters are in the 1254 x 1254 source (measured: x 235 to 1019,
// y 431 to 753), with 64px of the background on every side. The logo
// component fades that margin out, so the crop has no visible edge
const WORDMARK = { left: 171, top: 367, width: 912, height: 450 };
// A square around the letters, for the icons
const SQUARE = { left: 187, top: 152, width: 880, height: 880 };

const png = (region, size) =>
  sharp(source)
    .extract(region)
    .resize(size)
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();

// An .ico file that holds PNG images, which every current browser reads
const toIco = (images) => {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });

  return Buffer.concat([
    header,
    ...entries,
    ...images.map((image) => image.data),
  ]);
};

await mkdir(path.join(root, "public/brand"), { recursive: true });

const files = {
  "public/brand/rxj-wordmark.png": await png(WORDMARK, { width: 684 }),
  "src/app/icon.png": await png(SQUARE, { width: 256, height: 256 }),
  "src/app/apple-icon.png": await png(SQUARE, { width: 180, height: 180 }),
  "src/app/favicon.ico": toIco(
    await Promise.all(
      [16, 32, 48].map(async (size) => ({
        size,
        data: await png(SQUARE, { width: size, height: size }),
      })),
    ),
  ),
};

for (const [file, data] of Object.entries(files)) {
  await writeFile(path.join(root, file), data);
  console.log(`${file}  ${(data.length / 1024).toFixed(1)} KB`);
}
