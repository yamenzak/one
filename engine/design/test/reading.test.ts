/**
 * ONE BOX IS ONE CODE, AND FOR A WHILE ONE BOX WAS AS MANY CODES AS YOU LIKED.
 *
 * ⚠️ THIS IS A REPORTED BUG WITH A PHOTOGRAPH ATTACHED. Somebody held ONE pack of
 * tobacco sticks in front of the reader on the product-registration screen and
 * watched it collect a growing list of EAN-13s, none of which they had scanned.
 * The pack carries two symbols a few millimetres apart — a printed EAN-13 and a
 * GS1 DataMatrix — and `detect()` returns both.
 *
 * ⚠️ THE OLD LOOP TOOK `found[0]` AND COMPARED IT TO THE LAST READ. The decoder's
 * ordering is not stable frame to frame, so the same box alternated between two
 * strings, and each alternation differed from the previous one — which is
 * precisely the test the de-duplication used. Every flip was a new code.
 *
 * ⚠️ THREE THINGS FIX IT AND ALL THREE ARE NEEDED. Read EVERY symbol rather than
 * an arbitrary one; require frames to AGREE before believing any of them, so a
 * single confident misread is not a product; and compare against everything the
 * caller ALREADY HOLDS rather than against the last thing seen, so A-B-A is not
 * three codes. The fourth is the app's: folding a GS1 payload to its `(01)` so
 * the two symbols on that pack are recognised as one item.
 *
 * ⚠️ IT IS THE PURE DECISION THAT IS TESTED, NOT THE COMPONENT. Everything above
 * happens in a `requestAnimationFrame` loop around a `BarcodeDetector` that
 * exists in no test environment, so a component test would be a test of the
 * mocks. `sift` is the same walk over one frame's results with the state passed
 * in, which is what the loop calls.
 */

import { describe, expect, it } from "vitest";
import { SURE, siftFrame, type Votes } from "../src/parts/reading.js";

/** ⚠️ The real pack from the report. Both symbols, both real. */
const BARS = "4023500047203";
const MATRIX = "010402350004720310ABC1234";

const fresh = (): Votes => ({ votes: new Map(), told: new Map() });

/** ⚠️ Feed one frame N times, as holding a phone still would. */
const hold = (
  state: Votes, codes: readonly string[], times: number,
  at = 0, held: readonly string[] = [], fold = (r: string) => r,
) => {
  const out: { read: string[]; again: string[] } = { read: [], again: [] };
  for (let i = 0; i < times; i++) {
    const seen = siftFrame(state, codes, {
      now: at + i * 125, again: 1_500, held, fold,
    });
    out.read.push(...seen.read);
    out.again.push(...seen.again);
  }
  return out;
};

describe("a frame with two symbols on one box", () => {
  /*
    ⚠️ THE REPORTED BUG, AS A TEST. Alternating order is what a real decoder does
    and is the whole mechanism of the fault — a fixture that returned a stable
    order would pass against the broken code.
  */
  it("does not read a second product off the pack's DataMatrix", () => {
    const state = fresh();
    const seen: string[] = [];
    for (let i = 0; i < 12; i++) {
      /* ⚠️ Order flips every frame, exactly as the decoder's does. */
      const frame = i % 2 ? [BARS, MATRIX] : [MATRIX, BARS];
      seen.push(...siftFrame(state, frame, {
        now: i * 125, again: 1_500, held: [],
        /* The app's fold: a GS1 payload's `(01)` IS the EAN-13. */
        fold: (raw) => (raw.startsWith("01") && raw.length > 16
          ? raw.slice(3, 16) : raw),
      }).read);
    }
    expect(seen).toEqual([BARS]);
  });

  /* ⚠️ AND WITHOUT THE FOLD IT IS HONESTLY TWO, which is the layering being
     right rather than a leak: the reader reports what is on the box, and only
     the app knows the two mean one item. */
  it("reports both when the app does not fold them", () => {
    const state = fresh();
    const { read } = hold(state, [BARS, MATRIX], SURE);
    expect(read.sort()).toEqual([BARS, MATRIX].sort());
  });
});

describe("agreeing before believing", () => {
  /*
    ⚠️ A GLARE ACROSS A LABEL DECODES CONFIDENTLY AND WRONG. One frame is not a
    read — it is a number nobody typed entering somebody's product record.
  */
  it("ignores a code that appears on fewer frames than it takes", () => {
    const state = fresh();
    expect(hold(state, [BARS], SURE - 1).read).toEqual([]);
  });

  it("accepts it on the frame that completes the agreement", () => {
    const state = fresh();
    expect(hold(state, [BARS], SURE).read).toEqual([BARS]);
  });

  /* ⚠️ AND A PART-BUILT AGREEMENT EXPIRES. Two frames, the phone moves away, and
     the same misread half a minute later must not arrive two-thirds believed. */
  it("forgets votes that went stale", () => {
    const state = fresh();
    hold(state, [BARS], SURE - 1);
    expect(hold(state, [BARS], SURE - 1, 30_000).read).toEqual([]);
  });
});

describe("a code the caller already holds", () => {
  /*
    ⚠️ SAID, NOT SWALLOWED. Pointing at a code and getting nothing at all is what
    a broken scanner looks like, so somebody moves the phone and tries again.
  */
  it("is reported as a repeat rather than added twice", () => {
    const state = fresh();
    const seen = hold(state, [BARS], SURE, 0, [BARS]);
    expect(seen.read).toEqual([]);
    expect(seen.again).toEqual([BARS]);
  });

  /*
    ⚠️ AND THIS IS THE ONE COMPARING AGAINST THE LAST READ GOT WRONG. Two codes
    alternating in front of a lens — two boxes on a bench — each looked new every
    time the other one intervened, so a list of two grew without limit.
  */
  it("does not re-add a code just because another one came between", () => {
    const state = fresh();
    const held: string[] = [];
    const fold = (r: string) => r;
    for (const code of [BARS, "5000112637922", BARS, "5000112637922", BARS]) {
      for (let i = 0; i < SURE; i++) {
        const { read } = siftFrame(state, [code], {
          now: Date.now() + held.length * 10_000 + i * 125,
          again: 1_500, held, fold,
        });
        held.push(...read);
      }
    }
    expect(held).toEqual([BARS, "5000112637922"]);
  });
});

describe("what the app throws away", () => {
  /* ⚠️ A PACK'S MARKETING QR IS NOT A BARCODE, and on a screen collecting
     barcodes it is noise with a checksum. `""` from the fold drops it. */
  it("ignores a symbol the app rejects outright", () => {
    const state = fresh();
    const { read } = hold(state, ["https://example.com/promo", BARS], SURE, 0, [],
      (raw) => (raw.startsWith("http") ? "" : raw));
    expect(read).toEqual([BARS]);
  });
});
