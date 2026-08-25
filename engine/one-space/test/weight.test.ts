/**
 * WHAT THE FIRST PAINT DOWNLOADS, IN BYTES, WITH A CEILING ON IT.
 *
 * ⚠️ THE OTHER GUARDS OVER THIS ARE STRUCTURAL, AND STRUCTURE IS NOT WEIGHT.
 * `bundle.test.mjs` proves no page imports a product and that each product is a
 * chunk of its own — both true of a build that has since gained half a megabyte
 * of dependency in the entry. A megabyte of schema validator was deleted from
 * this exact chunk once (D58) and the person watching noticed nothing, because
 * nothing said what it had cost or what it may cost again.
 *
 * ⚠️ RENDER-BLOCKING, NOT "THE BUILD". The numbers here are the files
 * `index.html` itself references: one module and one stylesheet, which the
 * browser must have before it can paint anything. A lazily-loaded chunk is not
 * in this budget on purpose — making it one would punish the split that D58 is.
 *
 * ⚠️ AND BOTH NUMBERS, BECAUSE THEY ARE DIFFERENT COSTS. Gzip is what travels,
 * so it is the wait on a slow connection. Raw is what a phone PARSES and
 * compiles before the first frame, and it does not compress — a dependency that
 * gzips beautifully still costs the main thread every byte of itself.
 *
 * ⚠️ THE CEILINGS ARE CEILINGS, NOT TARGETS. A change that makes the first paint
 * lighter tightens them in the same commit; one that makes it heavier has to say
 * so by raising a number somebody will read in review. That is the whole
 * mechanism — a budget nobody has to edit is one that never bites.
 */

import { readFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");

/* Measured 2026-08-23, with headroom for ordinary growth and none for a new
   dependency nobody discussed. Raw is the parse cost; gzip is the wait.

   ⚠️ RAISED BY 26 BYTES ON 2026-08-25, AND THE NUMBER IS THE POINT. The declared
   surface grew three clauses — a list's columns, what its emptiness means, and
   which slot takes the whole outcome — and `refuseSurface` is real code that
   ships. Twenty-six bytes is not a cost worth arguing about; being made to write
   it down is. The renderer itself is NOT in here: it sits behind
   `@engine/design/body` so the entry chunk carries the contract and not the
   thirty components that draw from it. */
const CEILING = {
  js: { raw: 1_100_026, gzip: 330_000 },
  css: { raw: 470_000, gzip: 50_000 },
};

const kb = (n: number) => `${Math.round(n / 1024)} KiB`;

describe("what the first paint weighs", () => {
  /**
   * ⚠️ A MISSING BUILD MUST FAIL, NEVER SKIP. `@engine/space#test` depends on
   * `@engine/space#build` in `turbo.json`, so `dist` is always there through
   * turbo — and a `if (!exists) return` would turn the one route by which it
   * could be absent into a silent pass, which is the shape every guard here
   * refuses.
   */
  it("has a build to weigh", () => {
    expect(existsSync(join(DIST, "index.html")),
      "engine/one-space/dist is not built — run through turbo, which declares the edge")
      .toBe(true);
  });

  const html = existsSync(join(DIST, "index.html"))
    ? readFileSync(join(DIST, "index.html"), "utf8")
    : "";

  const scripts = [...html.matchAll(/<script[^>]+src="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  const styles = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="(\/assets\/[^"]+)"/g)]
    .map((m) => m[1]);

  /**
   * ⚠️ ONE OF EACH. A second render-blocking script is a second thing the
   * browser waits for before it can run the first, and it arrives by accident —
   * an entry that stopped being splittable, a plugin that emits its own. The
   * count is the cheapest way to notice.
   */
  it("blocks on one module and one stylesheet", () => {
    expect(scripts, `index.html references ${scripts.length} render-blocking script(s)`)
      .toHaveLength(1);
    expect(styles, `index.html references ${styles.length} render-blocking stylesheet(s)`)
      .toHaveLength(1);
  });

  const weigh = (href: string) => {
    const bytes = readFileSync(join(DIST, href.replace(/^\//, "")));
    return { raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length };
  };

  for (const [what, hrefs, ceiling] of [
    ["the entry module", scripts, CEILING.js],
    ["the stylesheet", styles, CEILING.css],
  ] as const) {
    it(`keeps ${what} inside its budget`, () => {
      const at = weigh(hrefs[0]!);
      expect(at.gzip,
        `${what} is ${kb(at.gzip)} gzipped, over its ${kb(ceiling.gzip)} ceiling — `
        + "that is the wait on a slow connection")
        .toBeLessThanOrEqual(ceiling.gzip);
      expect(at.raw,
        `${what} is ${kb(at.raw)} raw, over its ${kb(ceiling.raw)} ceiling — `
        + "that is what a phone parses before the first frame, and it does not compress")
        .toBeLessThanOrEqual(ceiling.raw);
    });
  }

  /**
   * ⚠️ AND THE CEILINGS FOLLOW THE BUILD DOWN. A budget left far above what the
   * build actually weighs stops being a budget: it absorbs the next regression
   * silently and only bites long after the commit that caused it. Slack is
   * capped, so making the bundle smaller and NOT tightening the number is
   * itself the failure.
   */
  it("keeps the ceilings within reach of the build", () => {
    for (const [what, hrefs, ceiling] of [
      ["the entry module", scripts, CEILING.js],
      ["the stylesheet", styles, CEILING.css],
    ] as const) {
      const at = weigh(hrefs[0]!);
      const slack = (ceiling.gzip - at.gzip) / ceiling.gzip;
      expect(slack,
        `${what} is ${kb(at.gzip)} against a ${kb(ceiling.gzip)} ceiling — `
        + "tighten the ceiling in the commit that made it smaller, or it absorbs "
        + "the next regression instead of reporting it")
        .toBeLessThan(0.25);
    }
  });
});
