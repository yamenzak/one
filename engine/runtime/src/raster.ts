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

import { inkAt, inkOf, shapeOf, type MarkOf } from "@engine/kernel";

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

/**
 * WHAT THESE BYTES ARE, SHORT ENOUGH TO PUT IN A HEADER.
 *
 * ⚠️ SO THAT A REVALIDATION COSTS NOTHING. An icon is deliberately kept fresh
 * for minutes rather than months — somebody uploads one and immediately looks —
 * and without a tag every one of those revalidations is the whole picture sent
 * again. With one it is a 304 and no body at all, on a path a phone asks for
 * three times on every cold start.
 *
 * ⚠️ CRC32 AND THE LENGTH, NOT A DIGEST. This says whether the bytes changed,
 * which is the only question a cache asks; it is not a claim about anybody who
 * might want two pictures to collide, and there is no such person for an icon.
 * The table is already here for the PNG chunks.
 */
export const etagOf = (bytes: Uint8Array): string =>
  `"${bytes.length.toString(36)}-${crc32(bytes).toString(36)}"`;

/* -------------------------------------------------------------- the tile --- */

export interface Tile {
  readonly of: MarkOf;
  readonly ground: string;
  readonly ink: string;
  /** ⚠️ Square. Every platform that asks for an icon asks for a square one. */
  readonly size: number;
}

/**
 * SUPERSAMPLING, AND HOW MUCH OF IT THE SIZE ACTUALLY NEEDS.
 *
 * ⚠️ THE RATE IS ABOUT THE FINEST FEATURE, NOT ABOUT TASTE. What has to survive
 * is a counter one drawing unit wide, and the mark stands 64 of those units tall
 * inside 60% of the tile — so a tile of `size` puts `size / 107` pixels across
 * one unit, and the samples across it are that times the rate. Four by four on a
 * 32px tile is 1.2 samples per unit and the counters only just live through it;
 * the same rate on 512 is nineteen, which draws the identical picture nineteen
 * times over.
 *
 * ⚠️ SO THE RATE FALLS AS THE PIXELS RISE, AND THE PRODUCT STAYS PUT: four below
 * 256 and two at or above it, which holds every size at ~4.8 samples per unit or
 * better. Measured against the fixed rate, tiles up to 64px are byte-identical
 * and a 512px tile differs on 787 of its 262,144 pixels — all of them on an
 * antialiased edge, in the grey level of one boundary pixel.
 *
 * ⚠️ AND THE FIXED RATE WAS COSTING SECONDS. Sixteen samples on a 512px tile is
 * 4,194,304 evaluations of the shape for one picture — measured at over three
 * seconds of CPU on a live Worker, on a thread every other request in that
 * isolate is waiting for. The comment this replaces said it "costs nothing
 * anybody will measure"; it was written for a 32px tile and inherited by one
 * 256 times the area.
 */
const samplesFor = (size: number): number => (size >= 256 ? 2 : 4);

/**
 * ⚠️ THE MARK SITS INSIDE A MARGIN, and it is not taste. A maskable icon has its
 * outer ~10% clipped away by the platform's own shape, so a mark drawn to the
 * edge loses its corners on Android and its whole beak on a circle mask. 20%
 * each side keeps the drawing inside the safe zone every platform agrees on.
 */
const MARGIN = 0.2;

/**
 * WHERE THE DRAWING LANDS, HOW FINELY IT IS SAMPLED, AND WHAT THAT COSTS.
 *
 * ⚠️ ONE CALL RETURNS THE PLAN AND THE PRICE OF IT, so nothing can budget for
 * one drawing and perform another. The defect this file was carrying is exactly
 * that shape: a sample rate chosen against a 32px tile, a tile size raised to
 * 512 somewhere else, and no single place where the product of the two is a
 * number anybody could look at. `cost` is that number — how many times drawing
 * this tile asks the shape where its ink is — and `raster.test.ts` holds it to a
 * budget, so raising either half fails there rather than on somebody's phone.
 */
export interface Fitting {
  readonly box: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly scale: number;
  readonly left: number;
  readonly top: number;
  /** The half-open pixel range the drawing can reach, clamped to the tile. */
  readonly x1: number;
  readonly x2: number;
  readonly y1: number;
  readonly y2: number;
  readonly samples: number;
  readonly cost: number;
}

export function fitting(tile: Tile): Fitting {
  const { size } = tile;
  /* Fit the ink box into the safe area, keeping its proportion. */
  const safe = size * (1 - MARGIN * 2);
  /* ⚠️ PER MARK, because the wallet's bars leave the numeral — see `inkOf`. */
  const box = inkOf(tile.of);
  const scale = Math.min(safe / box.w, safe / box.h);
  const left = (size - box.w * scale) / 2;
  const top = (size - box.h * scale) / 2;

  /* ⚠️ Clamped, because a mark whose box is wider than the safe area on one axis
     is centred and may start left of zero on a size small enough to round it. */
  const from = (v: number): number => Math.max(0, Math.floor(v));
  const to = (v: number): number => Math.min(size, Math.ceil(v));
  const x1 = from(left), x2 = to(left + box.w * scale);
  const y1 = from(top), y2 = to(top + box.h * scale);

  const samples = samplesFor(size);
  return {
    box, scale, left, top, x1, x2, y1, y2, samples,
    cost: Math.max(0, x2 - x1) * Math.max(0, y2 - y1) * samples * samples,
  };
}

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
  const { box, scale, left, top, x1, x2, y1, y2, samples } = fitting(tile);

  /*
    ⚠️ THE GROUND IS LAID DOWN FIRST AND THE DRAWING IS ASKED ABOUT NOWHERE
    ELSE. `box` is the ink's own bounds, so every pixel outside the fitted box is
    ground by construction — there is no sample that could say otherwise. Asking
    anyway is most of the picture: the margin alone is 36% of the tile, and the
    mark is taller than it is wide, so on the platform's own tile roughly four
    pixels in five were sixteen evaluations of a shape that ends before they
    start.
  */
  const out = new Uint8Array(new ArrayBuffer(size * size * CHANNELS));
  for (let at = 0; at < out.length; at += CHANNELS) {
    for (let c = 0; c < CHANNELS; c++) out[at + c] = ground[c]!;
  }

  /* ⚠️ THE SHAPE, ONCE. See `MarkShape` — resolved per sample, this is millions
     of allocations for a drawing that did not change between any two of them. */
  const shape = shapeOf(tile.of);

  const step = 1 / samples;
  const per = samples * samples;

  for (let y = y1; y < y2; y++) {
    for (let x = x1; x < x2; x++) {
      let sum = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          /* Back into the drawing's own coordinates. */
          const px = x + (sx + 0.5) * step;
          const py = y + (sy + 0.5) * step;
          const dx = box.x + ((px - left) / scale);
          const dy = box.y + ((py - top) / scale);
          sum += inkAt(shape, dx, dy);
        }
      }
      if (sum === 0) continue;
      const a = sum / per;
      const at = (y * size + x) * CHANNELS;
      for (let c = 0; c < CHANNELS; c++) {
        out[at + c] = Math.round(ground[c]! + (ink[c]! - ground[c]!) * a);
      }
    }
  }
  return out;
}

/**
 * ⚠️ THE SAME FOUR VALUES ALWAYS PRODUCE THE SAME BYTES, so an isolate that has
 * drawn a tile never draws it again. A deployment has one mark, one paint per
 * workspace and one size, so the live key space is a handful of entries — but it
 * is a workspace's colours, so it is bounded rather than trusted: past the cap
 * the oldest goes, which on a tab that keeps asking for its own icon is the one
 * nobody wants.
 */
const DRAWN = new Map<string, Uint8Array<ArrayBuffer>>();
const KEEP = 24;

/**
 * ⚠️ A TILE IS A PNG SOMEBODY'S PHONE CACHES FOR MONTHS — one call, both steps.
 *
 * ⚠️ AND IT IS DRAWN ON THE THREAD EVERY OTHER REQUEST IN THE ISOLATE IS
 * SHARING. A Worker has one thread per isolate, so the seconds this used to
 * spend were not the icon's alone: a live trace showed two tile requests burning
 * 6.4 seconds of CPU between them while an unrelated operation on the same
 * isolate ran out its ten-second limit. The memo is what makes that a cost paid
 * once rather than a cost paid by whoever else was in the queue.
 */
export const tilePng = async (tile: Tile): Promise<Uint8Array<ArrayBuffer>> => {
  const key = `${tile.of}|${tile.ground}|${tile.ink}|${tile.size}`;
  const had = DRAWN.get(key);
  if (had) return had;

  const png = await encodePng(tile.size, tile.size, drawTile(tile));
  if (DRAWN.size >= KEEP) {
    const oldest = DRAWN.keys().next();
    if (!oldest.done) DRAWN.delete(oldest.value);
  }
  DRAWN.set(key, png);
  return png;
};

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
