/**
 * Petdex spritesheet → Discord animated GIF art assets.
 *
 * Petdex ships one still spritesheet laid out as a grid: 8 columns × 9 rows,
 * each cell one animation frame. This slices a chosen row into frames, centres
 * each frame's opaque artwork on a square canvas, and encodes an endlessly
 * looping GIF at 10 fps.
 *
 * Usage:
 *   npm run sprites                       # nezukocoder, all clips
 *   npm run sprites -- --pet wukong       # another petdex pet
 *   npm run sprites -- --clip wave        # a single clip
 *
 * Output lands in assets/gifs/<pet>/<clip>.gif. Those files are committed and
 * are what users upload as Discord art assets; this script only produces them.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import gifenc from "gifenc";
import sharp from "sharp";

const { GIFEncoder } = gifenc;

const PETS_DIR = join(homedir(), ".petdex", "pets");

/** Grid geometry of the petdex spritesheet (measured from the shipped sheet). */
const CELL_W = 192;
const CELL_H = 208;
/** Cell height includes a transparent bottom margin; drop it before measuring. */
const CONTENT_H = 198;
/** Alpha at or below this counts as empty when measuring artwork bounds. */
const ALPHA_FLOOR = 16;
/** Coverage at or above which a source pixel is kept; below this it is cut. */
const ALPHA_CUTOFF = 128;

const OUTPUT_SIZE = 320;
const FRAME_DELAY_MS = 100; // 10 fps
const MAX_COLORS = 256;
/**
 * Ordered-dither strength for the quantiser. 0 keeps the sprite crisp and the
 * files small; any dithering scatters intermediate colours along the silhouette
 * and speckles the skin gradient, because there are only 256 colours to spend.
 */
const DITHER = 0;

/**
 * Row per clip, using the nine animation states the petdex/Codex atlas
 * defines, in top-to-bottom order. The state names are fixed by the format:
 *
 *   row 0 idle · 1 running-right · 2 running-left · 3 waving · 4 jumping
 *   row 5 failed · 6 waiting · 7 running · 8 review
 *
 * Do not name a row by guessing from the artwork — row 5 is `failed`, not
 * idle, and shipping it as the idle animation makes the pet look like it is
 * crashing while it waits for you.
 */
const CLIPS = {
  idle: { row: 0, frames: 6 },
  typing: { row: 8, frames: 6 }, // review — focused, working at the laptop
  reading: { row: 6, frames: 6 }, // waiting — looking over the laptop
  busy: { row: 7, frames: 6 }, // running — carrying the laptop, on the move
  thinking: { row: 4, frames: 5 }, // jumping — mid-task energy
} as const;

type ClipName = keyof typeof CLIPS;

const parseArgs = (argv: readonly string[]): { pet: string; clips: ClipName[] } => {
  let pet = "nezukocoder";
  const clips: ClipName[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--pet" && argv[i + 1]) pet = argv[++i]!;
    else if (arg === "--clip" && argv[i + 1]) {
      const name = argv[++i]!;
      if (!(name in CLIPS)) {
        throw new Error(`Unknown clip "${name}". Options: ${Object.keys(CLIPS).join(", ")}`);
      }
      clips.push(name);
    }
  }
  return { pet, clips: clips.length > 0 ? clips : (Object.keys(CLIPS) as ClipName[]) };
};

interface Box { left: number; top: number; width: number; height: number }

/** The sheet twice: raw pixels to measure artwork bounds, encoded bytes to crop. */
interface Sheet {
  readonly image: Buffer;
  readonly pixels: Buffer;
  readonly width: number;
}

const loadSheet = async (path: string): Promise<Sheet> => {
  const image = await sharp(path).toBuffer();
  const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { image, pixels: data, width: info.width };
};

/** Union of the opaque artwork across every frame in a clip.
 *
 * Each cell is measured on its own and the boxes are then merged. Measuring
 * the row as one block would span every column instead of one frame; measuring
 * frames separately without merging would let the character drift in scale and
 * position, so the clip would jitter instead of animate. */
const rowBounds = (sheet: Sheet, row: number, frames: number): Box => {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = -1;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = -1;

  for (let col = 0; col < frames; col++) {
    const cellLeft = col * CELL_W;
    const cellRight = Math.min(sheet.width, cellLeft + CELL_W);
    for (let y = 0; y < CONTENT_H; y++) {
      for (let x = cellLeft; x < cellRight; x++) {
        if (sheet.pixels[((row * CELL_H + y) * sheet.width + x) * 4 + 3]! <= ALPHA_FLOOR) continue;
        if (x - cellLeft < minX) minX = x - cellLeft;
        if (x - cellLeft > maxX) maxX = x - cellLeft;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error(`Row ${row} is empty — bad clip definition`);
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
};

/**
 * Cut the shared artwork region out of the sheet and scale it to fill
 * OUTPUT_SIZE, keeping aspect ratio and centring on a transparent square.
 */
const renderFrame = async (sheet: Sheet, row: number, box: Box, col: number): Promise<Buffer> => {
  const cell = await sharp(sheet.image)
    .extract({
      left: col * CELL_W + box.left,
      top: row * CELL_H + box.top,
      width: box.width,
      height: box.height,
    })
    .png()
    .toBuffer();

  // Nearest-neighbour, not the default resampling: the sprite is pixel art, and
  // interpolating across the transparent margin bleeds background colour into
  // the outline. Nearest keeps hard pixel edges and no halo.
  const inner = Math.floor(OUTPUT_SIZE * 0.94);
  const scaled = await sharp(cell)
    .resize(inner, inner, { fit: "inside", kernel: "nearest", withoutEnlargement: false })
    .toBuffer();

  const meta = await sharp(scaled).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const left = Math.floor((OUTPUT_SIZE - width) / 2);
  const top = Math.floor((OUTPUT_SIZE - height) / 2);

  return sharp(scaled)
    .extend({
      top,
      bottom: OUTPUT_SIZE - top - height,
      left,
      right: OUTPUT_SIZE - left - width,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .raw()
    .toBuffer()
    .then(binariseAlpha);
};

/**
 * Collapse alpha to fully transparent or fully opaque.
 *
 * This has to happen before quantisation, not after. A GIF marks transparency
 * with a single palette index and has no per-colour alpha, so any partial alpha
 * carried into the quantiser turns into a solid pixel in the finished file —
 * that is what leaves a speckled rim around the sprite instead of a clean
 * silhouette.
 */
const binariseAlpha = (rgba: Buffer): Buffer => {
  const out = Buffer.from(rgba);
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3]! >= ALPHA_CUTOFF) out[i + 3] = 255;
    else out[i] = out[i + 1] = out[i + 2] = out[i + 3] = 0;
  }
  return out;
};

interface Quantised {
  readonly palette: number[][];
  readonly transparentIndex: number;
  /** Palette indices, frame-major: frame f occupies `[f * size², (f+1) * size²)`. */
  readonly indices: Uint8Array;
}

/**
 * Reduce a whole clip to one shared 256-colour palette.
 *
 * All frames go through the quantiser together so they share one palette, which
 * is what keeps colours from flickering while the clip loops. Quantisation is
 * delegated to libimage via a palette PNG: the bundled gifenc quantiser drifts
 * enough on this art that dark hair picks up magenta speckles once it is
 * squeezed into 256 entries.
 */
const quantiseClip = async (frames: readonly Buffer[]): Promise<Quantised> => {
  const encoded = await Promise.all(
    frames.map((rgba) => sharp(rgba, { raw: { width: OUTPUT_SIZE, height: OUTPUT_SIZE, channels: 4 } }).png().toBuffer()),
  );
  const stacked = await sharp({
    create: { width: OUTPUT_SIZE, height: OUTPUT_SIZE * frames.length, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(encoded.map((input, i) => ({ input, left: 0, top: i * OUTPUT_SIZE })))
    .png({ palette: true, colours: MAX_COLORS, dither: DITHER, effort: 10 })
    .toBuffer();

  const palette = readPalette(stacked);
  const transparentIndex = palette.findIndex((c) => c[3] === 0);
  if (transparentIndex < 0) throw new Error("Quantised clip has no transparent palette entry");

  // The decoded image is built from exactly these palette entries, so an exact
  // RGBA lookup recovers the index with no colour drift at all.
  const lookup = new Map<string, number>();
  palette.forEach((c, i) => lookup.set(`${c[0] << 16 | c[1] << 8 | c[2]}:${c[3]}`, i));

  const { data } = await sharp(stacked).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const indices = new Uint8Array(OUTPUT_SIZE * OUTPUT_SIZE * frames.length);
  for (let i = 0; i < indices.length; i++) {
    const p = i * 4;
    const hit = lookup.get(`${data[p]! << 16 | data[p + 1]! << 8 | data[p + 2]!}:${data[p + 3]!}`);
    if (hit === undefined) throw new Error(`Pixel ${i} has no palette match — quantiser returned an unused colour`);
    indices[i] = hit;
  }
  return { palette, transparentIndex, indices };
};

/** Pull the PLTE colour table (and tRNS alpha) out of a palette PNG. */
const readPalette = (png: Buffer): number[][] => {
  let offset = 8;
  let plte: Buffer | null = null;
  let trns: Buffer | null = null;
  while (offset + 8 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const body = png.subarray(offset + 8, offset + 8 + length);
    if (type === "PLTE") plte = Buffer.from(body);
    if (type === "tRNS") trns = Buffer.from(body);
    offset += length + 12;
    if (type === "IEND") break;
  }
  if (!plte) throw new Error("Palette PNG has no PLTE chunk");

  const palette: number[][] = [];
  for (let i = 0; i < plte.length / 3; i++) {
    palette.push([plte[i * 3]!, plte[i * 3 + 1]!, plte[i * 3 + 2]!, trns && i < trns.length ? trns[i]! : 255]);
  }
  return palette;
};

/** One clip (one spritesheet row) → an endlessly looping animated GIF. */
const buildClip = async (sheet: Sheet, row: number, frames: number): Promise<Buffer> => {
  const box = rowBounds(sheet, row, frames);

  const rendered: Buffer[] = [];
  for (let f = 0; f < frames; f++) rendered.push(await renderFrame(sheet, row, box, f));

  const { palette, transparentIndex, indices } = await quantiseClip(rendered);
  const perFrame = OUTPUT_SIZE * OUTPUT_SIZE;

  const gif = GIFEncoder();
  for (let f = 0; f < frames; f++) {
    gif.writeFrame(indices.subarray(f * perFrame, (f + 1) * perFrame), OUTPUT_SIZE, OUTPUT_SIZE, {
      palette,
      delay: FRAME_DELAY_MS,
      transparent: true,
      transparentIndex,
      repeat: 0, // forever
      dispose: 2, // restore to background so frames cannot smear into each other
    });
  }
  gif.finish();
  return Buffer.from(gif.bytes());
};

const main = async (): Promise<void> => {
  const { pet, clips } = parseArgs(process.argv.slice(2));
  const sheet = await loadSheet(join(PETS_DIR, pet, "spritesheet.webp"));
  const outDir = join("assets", "gifs", pet);
  await mkdir(outDir, { recursive: true });

  for (const clip of clips) {
    const { row, frames } = CLIPS[clip];
    const gif = await buildClip(sheet, row, frames);
    const out = join(outDir, `${clip}.gif`);
    await writeFile(out, gif);
    console.log(`${out}  ${frames} frames  ${(gif.length / 1024).toFixed(1)} KiB`);
  }
};

await main();