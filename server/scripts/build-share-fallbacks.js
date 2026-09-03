'use strict';

/**
 * Generates the two platform fallback images for the shareable event page
 * (`GET /e/:id`, server/src/routes/share.routes.js) — the `og:image` used
 * when an event has no `poster_url` and its occasion type has no
 * `default_poster_url` either.
 *
 * Deliberately dependency-free: only Node's built-in `zlib` (no `sharp`, no
 * `canvas`, no native image library) — a hand-rolled PNG encoder (flat
 * background + simple filled/ringed circles, no text — no font is available
 * to render one). Re-run after any edit to the palette/shapes below:
 *
 *   node server/scripts/build-share-fallbacks.js
 *
 * Output: server/src/assets/share/festive.png and .../solemn.png, both
 * 1200×630 (matches the `og:image:width`/`og:image:height` the share route
 * declares) and both committed to git — this script is a generator, not a
 * build step that runs in production.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const WIDTH = 1200;
const HEIGHT = 630;
const OUT_DIR = path.join(__dirname, '..', 'src', 'assets', 'share');

// ---------------------------------------------------------------------------
// Minimal PNG encoder (8-bit RGB, no palette, no interlace, filter type 0).
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/** Encodes a flat RGB pixel grid (`pixels[y][x] = [r,g,b]`) as a PNG buffer. */
function encodePng(pixels, width, height) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0; // filter type: None
    offset += 1;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixels[y][x];
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      offset += 3;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour (RGB)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const idat = zlib.deflateSync(raw, { level: 9 });

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ---------------------------------------------------------------------------
// Shape helpers — operate on a plain `[y][x] = [r,g,b]` grid.
// ---------------------------------------------------------------------------

function makeGrid(width, height, [r, g, b]) {
  const grid = new Array(height);
  for (let y = 0; y < height; y += 1) {
    const row = new Array(width);
    for (let x = 0; x < width; x += 1) row[x] = [r, g, b];
    grid[y] = row;
  }
  return grid;
}

/** Fills a ring (annulus) centred at (cx, cy) between innerR and outerR. */
function drawRing(grid, width, height, cx, cy, innerR, outerR, [r, g, b]) {
  const minY = Math.max(0, Math.floor(cy - outerR));
  const maxY = Math.min(height - 1, Math.ceil(cy + outerR));
  const minX = Math.max(0, Math.floor(cx - outerR));
  const maxX = Math.min(width - 1, Math.ceil(cx + outerR));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const d = Math.hypot(x - cx, y - cy);
      if (d >= innerR && d <= outerR) grid[y][x] = [r, g, b];
    }
  }
}

/** Fills a solid diamond (rotated square) centred at (cx, cy) with "radius" size. */
function drawDiamond(grid, width, height, cx, cy, size, [r, g, b]) {
  const minY = Math.max(0, Math.floor(cy - size));
  const maxY = Math.min(height - 1, Math.ceil(cy + size));
  const minX = Math.max(0, Math.floor(cx - size));
  const maxX = Math.min(width - 1, Math.ceil(cx + size));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (Math.abs(x - cx) + Math.abs(y - cy) <= size) grid[y][x] = [r, g, b];
    }
  }
}

// ---------------------------------------------------------------------------
// Palettes — warm/gold for festive, muted/quiet for solemn. Solemn carries no
// figure of a person (used for عزاء): a geometric ring motif only.
// ---------------------------------------------------------------------------

function buildFestive() {
  const bg = [196, 148, 66]; // warm gold
  const grid = makeGrid(WIDTH, HEIGHT, bg);
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;

  // Concentric rings, alternating two warm accent tones — a simple emblem,
  // no text (no font is available to render one).
  drawRing(grid, WIDTH, HEIGHT, cx, cy, 0, 150, [214, 174, 108]);
  drawRing(grid, WIDTH, HEIGHT, cx, cy, 150, 170, [161, 116, 46]);
  drawRing(grid, WIDTH, HEIGHT, cx, cy, 170, 200, [226, 193, 140]);
  drawDiamond(grid, WIDTH, HEIGHT, cx, cy, 70, [161, 116, 46]);

  return grid;
}

function buildSolemn() {
  const bg = [63, 69, 82]; // muted slate — quiet, no warmth
  const grid = makeGrid(WIDTH, HEIGHT, bg);
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;

  // A single quiet ring — no filled figure, no warm colour, nothing that
  // reads as festive. Deliberately spare.
  drawRing(grid, WIDTH, HEIGHT, cx, cy, 140, 152, [124, 132, 148]);
  drawRing(grid, WIDTH, HEIGHT, cx, cy, 190, 196, [90, 97, 112]);
  return grid;
}

function writePng(grid, filename) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const buffer = encodePng(grid, WIDTH, HEIGHT);
  const outPath = path.join(OUT_DIR, filename);
  fs.writeFileSync(outPath, buffer);
  console.log(`wrote ${outPath} (${buffer.length} bytes)`);
}

writePng(buildFestive(), 'festive.png');
writePng(buildSolemn(), 'solemn.png');
