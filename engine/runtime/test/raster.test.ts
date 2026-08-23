/**
 * THE ICON, DECODED — never merely produced.
 *
 * ⚠️ AN ENCODER NOTHING READS BACK IS A FILE THAT LOOKS CORRECT FROM INSIDE. Every
 * way this can be wrong — a CRC over the wrong span, a missing filter byte, raw
 * deflate where zlib was wanted — produces bytes of exactly the right length
 * with exactly the right header, and fails only in a browser, on a phone,
 * silently, as a missing picture. So the assertions here decode the bytes with
 * `node:zlib` rather than trusting them.
 *
 * ⚠️ AND THE PIXELS ARE CHECKED, NOT JUST THE CONTAINER. A PNG that decodes to a
 * flat rectangle of the ground colour is a valid PNG of nothing, which is what
 * every failure of the rasteriser half looks like.
 */

import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { inkAt, inkOf, shapeOf } from "@engine/kernel";
import { drawTile, encodePng, etagOf, fitting, tilePng } from "../src/raster.js";
import { TILE } from "../src/installable.js";

/* --------------------------------------------------------------- decoding --- */

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** ⚠️ A real reader: it walks the chunks and verifies each CRC, because a wrong
    CRC is the failure a browser rejects and nothing here would otherwise see. */
function decode(png: Uint8Array) {
  for (let i = 0; i < SIGNATURE.length; i++) {
    expect(png[i], `byte ${i} of the signature`).toBe(SIGNATURE[i]);
  }
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks: Record<string, Uint8Array> = {};
  const order: string[] = [];
  let at = 8;
  while (at < png.length) {
    const len = view.getUint32(at);
    const type = new TextDecoder().decode(png.subarray(at + 4, at + 8));
    const data = png.subarray(at + 8, at + 8 + len);
    const said = view.getUint32(at + 8 + len);
    expect(crc32(png.subarray(at + 4, at + 8 + len)), `${type}: CRC`).toBe(said);
    chunks[type] = data;
    order.push(type);
    at += 12 + len;
  }
  expect(at, "the chunks do not account for every byte").toBe(png.length);

  const ihdr = new DataView(chunks.IHDR!.buffer, chunks.IHDR!.byteOffset);
  const width = ihdr.getUint32(0);
  const height = ihdr.getUint32(4);

  /* ⚠️ `inflateSync`, not `inflateRawSync` — this is the assertion that catches
     `deflate-raw`, which produces a file that is wrong nowhere but a decoder. */
  const raw = new Uint8Array(inflateSync(Buffer.from(chunks.IDAT!)));
  const stride = width * 3;
  const rgb = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    expect(raw[y * (stride + 1)], `row ${y} filter byte`).toBe(0);
    rgb.set(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride), y * stride);
  }
  return { width, height, rgb, order, pixel: (x: number, y: number) =>
    [rgb[(y * width + x) * 3], rgb[(y * width + x) * 3 + 1], rgb[(y * width + x) * 3 + 2]] };
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

const crc32 = (bytes: Uint8Array): number => {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/* ------------------------------------------------------------------ tests --- */

const BLACK = "#000000";
const WHITE = "#ffffff";

describe("the png encoder", () => {
  it("writes a file a decoder accepts, chunk by chunk", async () => {
    const png = await encodePng(2, 2, new Uint8Array([
      255, 0, 0, 0, 255, 0,
      0, 0, 255, 255, 255, 255,
    ]));
    const got = decode(png);
    expect(got.order).toEqual(["IHDR", "IDAT", "IEND"]);
    expect(got.width).toBe(2);
    expect(got.height).toBe(2);
    expect(got.pixel(0, 0)).toEqual([255, 0, 0]);
    expect(got.pixel(1, 0)).toEqual([0, 255, 0]);
    expect(got.pixel(0, 1)).toEqual([0, 0, 255]);
    expect(got.pixel(1, 1)).toEqual([255, 255, 255]);
  });

  /* ⚠️ ROW-ORDER, WHICH IS THE FILTER-BYTE BUG WEARING ITS OTHER FACE. Off by
     one channel per row, an image shears — and on a square icon of a symmetric
     shape that is genuinely hard to see. A tall image makes it obvious. */
  it("keeps rows in order and does not shear", async () => {
    const rows = 5;
    const rgb = new Uint8Array(rows * 3);
    for (let y = 0; y < rows; y++) rgb[y * 3] = (y + 1) * 20;
    const got = decode(await encodePng(1, rows, rgb));
    for (let y = 0; y < rows; y++) expect(got.pixel(0, y)![0]).toBe((y + 1) * 20);
  });
});

describe("the tile", () => {
  it("draws the mark, not a flat rectangle", async () => {
    const got = decode(await tilePng({ of: "one", ground: BLACK, ink: WHITE, size: 64 }));
    expect(got.width).toBe(64);
    expect(got.height).toBe(64);

    const values = new Set<number>();
    for (let i = 0; i < got.rgb.length; i += 3) values.add(got.rgb[i]!);
    /* ⚠️ Ground, ink and the blends between them. A tile that failed to draw is
       one value; a tile that drew without antialiasing is two. */
    expect(values.size).toBeGreaterThan(2);
  });

  /* ⚠️ THE MARGIN IS THE MASKABLE SAFE AREA, and losing it costs the beak on
     every Android launcher that clips to a circle — on the phone, not here. */
  it("keeps the drawing clear of every edge", async () => {
    const got = decode(await tilePng({ of: "one", ground: BLACK, ink: WHITE, size: 64 }));
    const edges = [
      ...Array.from({ length: 64 }, (_, i) => got.pixel(i, 0)),
      ...Array.from({ length: 64 }, (_, i) => got.pixel(i, 63)),
      ...Array.from({ length: 64 }, (_, i) => got.pixel(0, i)),
      ...Array.from({ length: 64 }, (_, i) => got.pixel(63, i)),
    ];
    for (const px of edges) expect(px).toEqual([0, 0, 0]);
  });

  /* ⚠️ THE COLOURS ARE THE WORKSPACE'S, and a tile that ignores them is one that
     silently paints every business the same. */
  it("paints in the colours it was given", async () => {
    const got = decode(await tilePng({ of: "one", ground: "#123456", ink: "#abcdef", size: 32 }));
    expect(got.pixel(0, 0)).toEqual([0x12, 0x34, 0x56]);
    const inks = [];
    for (let i = 0; i < got.rgb.length; i += 3) {
      if (got.rgb[i] === 0xab && got.rgb[i + 1] === 0xcd && got.rgb[i + 2] === 0xef) inks.push(i);
    }
    expect(inks.length, "no pixel was painted in the ink colour").toBeGreaterThan(0);
  });

  /*
    ⚠️ THE TWO MARKS ARE DIFFERENT PICTURES. A product's carries rings the
    platform's does not; if `partsOf` were ignored they would encode identically
    and every product would ship the platform's mark as its own.
  */
  it("draws a product's mark differently from the platform's", async () => {
    const one = drawTile({ of: "one", ground: BLACK, ink: WHITE, size: 64 });
    const space = drawTile({ of: "space", ground: BLACK, ink: WHITE, size: 64 });
    const wallet = drawTile({ of: "wallet", ground: BLACK, ink: WHITE, size: 64 });
    expect(Buffer.from(one).equals(Buffer.from(space))).toBe(false);
    expect(Buffer.from(one).equals(Buffer.from(wallet))).toBe(false);
    expect(Buffer.from(space).equals(Buffer.from(wallet))).toBe(false);
  });

  /*
    ⚠️ THE WALLET'S BARS ARE ADDED, NOT CUT, AND THEY LEAVE THE STEM. That
    overhang IS the mark — a currency sign that read as a plain numeral beside
    every credit figure would be worse than no sign at all — so both halves are
    asserted: ink to the right of the stem, and ink where a bar crosses it.
  */
  it("crosses the wallet's numeral with bars that overhang it", () => {
    /* Past the stem's right edge, on the upper bar. */
    expect(inkAt(shapeOf("wallet"), 70, 40)).toBe(1);
    /* Left of the stem, on the same bar, below the beak. */
    expect(inkAt(shapeOf("wallet"), 40, 46)).toBe(1);
    /* Between the two bars, outside the stem: nothing. */
    expect(inkAt(shapeOf("wallet"), 70, 47)).toBe(0);
    /* ⚠️ And the numeral is still under them — a wallet is the mark with
       something added, never a different shape. */
    expect(inkAt(shapeOf("wallet"), 56, 70)).toBe(1);
    expect(inkAt(shapeOf("wallet"), 34, 30)).toBeGreaterThan(0);
  });

  /* ⚠️ A MALFORMED COLOUR COSTS A TILE, NEVER THE ROUTE. This is read on the
     public path a cold start takes, from a value a workspace typed. */
  it("survives a colour somebody typed wrong", async () => {
    await expect(tilePng({ of: "one", ground: "not a colour", ink: "#fff", size: 16 }))
      .resolves.toBeInstanceOf(Uint8Array);
  });
});

/**
 * ⚠️ THE THREAD THIS RUNS ON IS SHARED WITH EVERY OTHER REQUEST IN THE ISOLATE,
 * which is why the icon's cost is asserted rather than assumed. It shipped at
 * 4,194,304 evaluations of the shape per picture — a rate chosen for a 32px tile
 * multiplied by a size raised to 512 somewhere else, with no place where the
 * product of the two was a number anybody looked at. On a live Worker that was
 * over three seconds of CPU, and a trace caught an unrelated operation running
 * out its ten-second limit beside two of them.
 */
describe("what the icon costs", () => {
  /* ⚠️ THE SIZE THE DEPLOYMENT ACTUALLY SERVES, imported rather than repeated —
     raising `TILE` has to fail here, and it cannot if this holds its own copy. */
  const BUDGET = 400_000;

  it("draws the served tile inside its budget", () => {
    const { cost } = fitting({ of: "one", ground: BLACK, ink: WHITE, size: TILE });
    expect(cost, `drawing the ${TILE}px tile asks the shape ${cost} times`)
      .toBeLessThanOrEqual(BUDGET);
  });

  /* ⚠️ AND THE BUDGET IS NOT MET BY DRAWING NOTHING. A fitting that collapsed to
     an empty range would cost zero and pass, having produced a flat rectangle. */
  it("still covers the whole drawing", () => {
    const of = { of: "one" as const, ground: BLACK, ink: WHITE, size: TILE };
    const fit = fitting(of);
    expect(fit.x2 - fit.x1).toBeGreaterThan(TILE / 4);
    expect(fit.y2 - fit.y1).toBeGreaterThan(TILE / 4);
    /* The range must reach every pixel the ink can land on, or the tile is
       silently cropped — which looks like a design decision, not a bug. */
    expect(fit.x1).toBeLessThanOrEqual(Math.floor(fit.left));
    expect(fit.y1).toBeLessThanOrEqual(Math.floor(fit.top));
    expect(fit.x2).toBeGreaterThanOrEqual(Math.ceil(fit.left + fit.box.w * fit.scale));
    expect(fit.y2).toBeGreaterThanOrEqual(Math.ceil(fit.top + fit.box.h * fit.scale));
  });

  /*
    ⚠️ THE FINEST FEATURE IS ONE DRAWING UNIT — a counter, on a 32px tile a third
    of a pixel wide. The budget above is affordable only because the sample rate
    falls as the tile grows, so this is the other half of that trade and has to
    be asserted beside it: no size may end up sampled more thinly than the
    smallest tile has always lived with, which is 1.2 samples per drawing unit.
    Below that the counters close up and the mark ships as a plain bar.
  */
  const FLOOR = 1.2;

  it("keeps the counters sampled at every size", () => {
    for (const size of [32, 64, 128, 256, 512]) {
      const fit = fitting({ of: "one", ground: BLACK, ink: WHITE, size });
      /* Pixels across one drawing unit, times samples per pixel. */
      const perUnit = fit.scale * fit.samples;
      expect(perUnit, `${size}px: ${perUnit.toFixed(1)} samples per drawing unit`)
        .toBeGreaterThanOrEqual(FLOOR);
    }
  });

  /* ⚠️ AND THE SAME TILE IS NEVER DRAWN TWICE. Three paths ask for this picture
     on every cold start and none of them changes it; without the memo each one
     pays the whole cost again, on the thread the rest of the isolate is queued
     behind. */
  it("draws a tile once and answers with the same bytes after", async () => {
    const of = { of: "one" as const, ground: "#010203", ink: "#f0e1d2", size: 64 };
    const first = await tilePng(of);
    const again = await tilePng({ ...of });
    expect(again).toBe(first);
    /* A different workspace's colours are a different picture, not a cache hit. */
    expect(await tilePng({ ...of, ink: "#ffffff" })).not.toBe(first);
  });

  /* ⚠️ AND A REVALIDATION COSTS NO BODY. The icon is kept fresh for minutes on
     purpose, so it is revalidated often — a tag is what makes that a 304. */
  it("tags the bytes, and a changed picture gets a changed tag", async () => {
    const of = { of: "one" as const, ground: BLACK, ink: WHITE, size: 32 };
    expect(etagOf(await tilePng(of))).toBe(etagOf(await tilePng({ ...of })));
    expect(etagOf(await tilePng(of)))
      .not.toBe(etagOf(await tilePng({ ...of, ground: "#111111" })));
  });
});

describe("the geometry the two renderers share", () => {
  /*
    ⚠️ THE INK BOX HAS TO BE THE INK. If `MARK_INK` drifted from the shapes, the
    SVG would crop wrongly and the tile would sit off-centre — one of those is
    visible and the other is not, so it is checked here rather than noticed
    there.
  */
  it("bounds every part of the mark, tightly", () => {
    for (const of of ["one", "space", "wallet"] as const) {
      const MARK_INK = inkOf(of);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let y = 0; y <= 100; y += 0.25) {
        for (let x = 0; x <= 100; x += 0.25) {
          if (inkAt(shapeOf(of), x, y) <= 0) continue;
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
      }
      expect(minX, `${of}: ink left of the box`).toBeGreaterThanOrEqual(MARK_INK.x);
      expect(minY, `${of}: ink above the box`).toBeGreaterThanOrEqual(MARK_INK.y);
      expect(maxX, `${of}: ink right of the box`).toBeLessThanOrEqual(MARK_INK.x + MARK_INK.w);
      expect(maxY, `${of}: ink below the box`).toBeLessThanOrEqual(MARK_INK.y + MARK_INK.h);
      /* Tight: the box is the drawing, not a margin round it. */
      expect(maxX - minX, `${of}: the box is wider than the ink`)
        .toBeGreaterThan(MARK_INK.w - 1);
      expect(maxY - minY, `${of}: the box is taller than the ink`)
        .toBeGreaterThan(MARK_INK.h - 1);
    }
  });

  /* ⚠️ CUT, THEN KEEP. Testing the kept dot first fills a hole that was never
     cut, and the rings vanish — in the tile only, because the SVG builds the
     same shape a different way. */
  it("cuts a ring out of the stem and keeps its centre", () => {
    /* The centre of the first ring is ink; the annulus around it is not. */
    expect(inkAt(shapeOf("space"), 52, 36)).toBe(1);
    expect(inkAt(shapeOf("space"), 52 + 3.5, 36)).toBe(0);
    /* And the platform's mark has no ring there at all — solid stem. */
    expect(inkAt(shapeOf("one"), 56, 36)).toBe(1);
  });
});
