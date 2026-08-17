/**
 * A PNG, DRAWN IN A WORKER, WITH NOTHING INSTALLED.
 *
 * ⚠️ THIS EXISTS BECAUSE AN SVG IS NOT ENOUGH AND THE GAP IS INVISIBLE. Modern
 * browsers take an SVG favicon, so a tab looks right and the job looks done —
 * but `apple-touch-icon` must be a raster, and a workspace added to an iOS home
 * screen with no PNG gets a screenshot of the page instead of a mark. Nothing
 * fails, nobody is told, and the person looking at their own phone assumes it is
 * how the product is.
 *
 * ⚠️ SO THE WORKER DRAWS ONE. It has no canvas, and the alternatives were both
 * worse: an image service is a third party on the path of every tab in the
 * product, and a committed PNG per size is a binary nobody can review that goes
 * stale the first time the mark is redrawn. Two shapes and a circle are not hard
 * to rasterise; what was hard was the encoder, and it is ~80 lines.
 *
 * ⚠️ `CompressionStream("deflate")` IS ZLIB-WRAPPED (RFC 1950), WHICH IS WHAT
 * `IDAT` WANTS. `deflate-raw` is the other one, and a PNG built from it decodes
 * nowhere while looking exactly as correct from here. It is available in Workers
 * and in Node, which is what makes this testable at all.
 *
 * ⚠️ AND THE GEOMETRY IS THE KERNEL'S, never a second copy. See `kernel/src/mark.ts`
 * — the browser draws the same numbers as SVG, and the two are checked against
 * each other rather than trusted.
 */

import { inkAt, inkOf, type MarkOf } from "@engine/kernel";

/* ------------------------------------------------------------------- png --- */

/**
 * ⚠️ TRUECOLOUR (TYPE 2), NOT PALETTE. The mark is antialiased against its
 * ground, so its edge pixels are a blend — a palette would need one entry per
 * blend step, which is a quantiser, which is the thing this file exists not to
 * be. Eight bits, no alpha: the tile is a filled rounded square, so there is
 * nothing behind it to show through.
 */
const CHANNELS = 3;

const CRC = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array): number => {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const be32 = (n: number): Uint8Array<ArrayBuffer> =>
  new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);

/* ⚠️ `Uint8Array<ArrayBuffer>` throughout, not the default `ArrayBufferLike`.
   A view that MIGHT be over a SharedArrayBuffer is not a `BufferSource`, so the
   general type does not satisfy `Response` or a stream writer — and the error
   arrives at the call site rather than here, where it reads as unrelated. */
const join = (parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(new ArrayBuffer(parts.reduce((n, p) => n + p.length, 0)));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};

/**
 * ⚠️ EVERY CHUNK CARRIES ITS OWN CRC OVER TYPE **AND** DATA — not over the
 * length. A decoder that checks it rejects the whole file, so getting this
 * subtly wrong produces bytes that are a PNG everywhere except in a browser.
 */
const chunk = (type: string, data: Uint8Array): Uint8Array<ArrayBuffer> => {
  const tag = new TextEncoder().encode(type);
  const body = join([tag, data]);
  return join([be32(data.length), body, be32(crc32(body))]);
};

const deflate = async (raw: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> => {
  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();
  void writer.write(raw);
  void writer.close();
  const done = await new Response(cs.readable).arrayBuffer();
  return new Uint8Array(done);
};

/**
 * RGB PIXELS IN, PNG BYTES OUT.
 *
 * ⚠️ EVERY SCANLINE IS PREFIXED WITH ITS FILTER BYTE, and it is 0 (none). PNG
 * filtering is a compression optimisation; a missing filter byte is not a
 * smaller file, it is a row shifted by one channel and an image that shears
 * diagonally.
 */
export async function encodePng(
  width: number, height: number, rgb: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  const stride = width * CHANNELS;
  const raw = new Uint8Array(new ArrayBuffer((stride + 1) * height));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(rgb.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }

  const ihdr = join([
    be32(width), be32(height),
    /* depth 8, colour type 2, deflate, adaptive filtering, no interlace */
    new Uint8Array([8, 2, 0, 0, 0]),
  ]);

  return join([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", await deflate(raw)),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/* -------------------------------------------------------------- the tile --- */

export interface Tile {
  readonly of: MarkOf;
  readonly ground: string;
  readonly ink: string;
  /** ⚠️ Square. Every platform that asks for an icon asks for a square one. */
  readonly size: number;
}

/**
 * ⚠️ FOUR BY FOUR SUPERSAMPLING, WHICH IS THE WHOLE ANTIALIASING STRATEGY. The
 * mark is a diagonal and two thin slots; sampled once per pixel at 32px the
 * diagonal is a staircase and the slots disappear entirely between sample
 * points. Sixteen samples is enough for a shape this simple and costs nothing
 * anybody will measure on an icon.
 */
const SAMPLES = 4;

/**
 * ⚠️ THE MARK SITS INSIDE A MARGIN, and it is not taste. A maskable icon has its
 * outer ~10% clipped away by the platform's own shape, so a mark drawn to the
 * edge loses its corners on Android and its whole beak on a circle mask. 20%
 * each side keeps the drawing inside the safe zone every platform agrees on.
 */
const MARGIN = 0.2;

/**
 * THE WORKSPACE'S TILE, AS PIXELS.
 *
 * ⚠️ THE MARK IS FITTED BY ITS INK, NOT BY ITS CANVAS — see `MARK_INK`. Scaling
 * the 100-unit square into the safe area would put the numeral in the corner of
 * its own icon, which is the same defect the stacked lockup had, one surface
 * over.
 */
export function drawTile(tile: Tile): Uint8Array<ArrayBuffer> {
  const { size } = tile;
  const ground = rgbOf(tile.ground);
  const ink = rgbOf(tile.ink);

  /* Fit the ink box into the safe area, keeping its proportion. */
  const safe = size * (1 - MARGIN * 2);
  /* ⚠️ PER MARK, because the wallet's bars leave the numeral — see `inkOf`. */
  const box = inkOf(tile.of);
  const scale = Math.min(safe / box.w, safe / box.h);
  const drawnW = box.w * scale;
  const drawnH = box.h * scale;
  const left = (size - drawnW) / 2;
  const top = (size - drawnH) / 2;

  const out = new Uint8Array(new ArrayBuffer(size * size * CHANNELS));
  const step = 1 / SAMPLES;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          /* Back into the drawing's own coordinates. */
          const px = x + (sx + 0.5) * step;
          const py = y + (sy + 0.5) * step;
          const dx = box.x + ((px - left) / scale);
          const dy = box.y + ((py - top) / scale);
          sum += inkAt(tile.of, dx, dy);
        }
      }
      const a = sum / (SAMPLES * SAMPLES);
      const at = (y * size + x) * CHANNELS;
      for (let c = 0; c < CHANNELS; c++) {
        out[at + c] = Math.round(ground[c]! + (ink[c]! - ground[c]!) * a);
      }
    }
  }
  return out;
}

/** ⚠️ A tile is a PNG somebody's phone caches for months — one call, both steps. */
export const tilePng = async (tile: Tile): Promise<Uint8Array<ArrayBuffer>> =>
  encodePng(tile.size, tile.size, drawTile(tile));

/**
 * ⚠️ `#rgb` AND `#rrggbb`, AND ANYTHING ELSE IS BLACK RATHER THAN A THROW. This
 * reads a colour a workspace typed into its own settings; a malformed one must
 * cost them a tile that looks wrong, never the route that serves it — this is on
 * the public path a cold start takes.
 */
function rgbOf(hex: string): readonly [number, number, number] {
  const s = hex.trim().replace(/^#/, "");
  const full = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return [0, 0, 0];
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}
