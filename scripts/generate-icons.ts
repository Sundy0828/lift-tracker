// Generates the PWA icon set as real PNGs with no image dependency:
// a tiny RGBA -> PNG encoder over a hand-rasterized barbell glyph.
// Run with `npm run icons` (Node strips the types natively).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

type Rgba = readonly [number, number, number, number];

const BG: Rgba = [18, 16, 15, 255]; // #12100f
const FG: Rgba = [116, 199, 238, 255]; // #74c7ee
const OUT_DIR = fileURLToPath(new URL('../public/icons/', import.meta.url));

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size: number, pixels: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha

  // Each scanline is prefixed with its filter type (0 = none).
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * stride;
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

type IconOptions = {
  /** Fraction of the edge kept clear around the glyph. */
  inset: number;
  /** Round the background corners. Maskable icons stay square. */
  rounded: boolean;
};

function drawIcon(size: number, { inset, rounded }: IconOptions): Buffer {
  const px = Buffer.alloc(size * size * 4);
  const radius = rounded ? size * 0.22 : 0;

  const set = (x: number, y: number, rgba: Rgba): void => {
    const i = (y * size + x) * 4;
    px[i] = rgba[0];
    px[i + 1] = rgba[1];
    px[i + 2] = rgba[2];
    px[i + 3] = rgba[3];
  };

  const insideRounded = (x: number, y: number): boolean => {
    if (radius === 0) return true;
    const cx = Math.min(Math.max(x + 0.5, radius), size - radius);
    const cy = Math.min(Math.max(y + 0.5, radius), size - radius);
    const dx = x + 0.5 - cx;
    const dy = y + 0.5 - cy;
    return dx * dx + dy * dy <= radius * radius;
  };

  // Barbell within the glyph box: bar, two inner plates, two outer plates.
  const box = size * (1 - inset * 2);
  const originX = size * inset;
  const midY = size * inset + box / 2;
  const rects = [
    { x: 0.2, w: 0.6, h: 0.1 }, // bar
    { x: 0.12, w: 0.1, h: 0.44 }, // inner plate, left
    { x: 0.78, w: 0.1, h: 0.44 }, // inner plate, right
    { x: 0.0, w: 0.08, h: 0.28 }, // outer plate, left
    { x: 0.92, w: 0.08, h: 0.28 }, // outer plate, right
  ].map((r) => ({
    x0: originX + r.x * box,
    x1: originX + (r.x + r.w) * box,
    y0: midY - (r.h * box) / 2,
    y1: midY + (r.h * box) / 2,
  }));

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!insideRounded(x, y)) {
        set(x, y, [0, 0, 0, 0]);
        continue;
      }
      const cx = x + 0.5;
      const cy = y + 0.5;
      const onGlyph = rects.some((r) => cx >= r.x0 && cx <= r.x1 && cy >= r.y0 && cy <= r.y1);
      set(x, y, onGlyph ? FG : BG);
    }
  }

  return encodePng(size, px);
}

const targets: readonly { name: string; size: number; options: IconOptions }[] = [
  { name: 'icon-192.png', size: 192, options: { inset: 0.2, rounded: true } },
  { name: 'icon-512.png', size: 512, options: { inset: 0.2, rounded: true } },
  { name: 'apple-touch-icon.png', size: 180, options: { inset: 0.2, rounded: false } },
  // Maskable icons need a bigger inset so the glyph survives any mask shape.
  { name: 'maskable-512.png', size: 512, options: { inset: 0.3, rounded: false } },
];

mkdirSync(OUT_DIR, { recursive: true });
for (const target of targets) {
  writeFileSync(join(OUT_DIR, target.name), drawIcon(target.size, target.options));
  console.log(`wrote icons/${target.name} (${target.size}x${target.size})`);
}
