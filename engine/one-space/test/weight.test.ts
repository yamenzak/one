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
   thirty components that draw from it.

   ⚠️ AND BY 3,534 MORE ON 2026-08-25 FOR THE LAZY BOUNDARY THAT KEEPS IT THAT
   WAY. `AppSurface` draws a declared body through `Declared`, and importing it
   statically put 10 KiB of renderer into the module the first paint blocks on —
   this guard is what caught it, on the commit that did it, which is the only
   reason it was noticed. What is left in here is the `React.lazy` call, the
   Suspense boundary and Vite's manifest entry for the chunk. The trade is
   explicit: 3.5 KiB of plumbing to keep 10 KiB of components out. Seven of
   those bytes are a ternary in `PersonRow`: a row with no face draws no plate,
   which the first declared list is what found — `Face` falls back to an initial
   when given nothing, and four notes came out with monograms down the edge as
   though they had identities.

   ⚠️ AND BY 1,219 ON 2026-08-25 FOR THE ONE HOP OVER A REFERENCE. `reachFor`,
   `sayReach`, `hopsIn` and `columnsIn` are the kernel's, and the kernel is in
   this chunk because the browser validates the manifest it was handed — so a
   contract that grows is a first paint that grows. What is NOT in here is the
   join itself: `runtime/src/joined.ts` runs on the worker and never reaches a
   browser bundle at all. Twelve OneInventory screens cannot be declared without
   it, which is the trade the number records.

   ⚠️ AND 864 MORE FOR THE TALLY — `refuseView`'s four new refusals and
   `talliedIn`. Same reason as the hop: the browser validates the manifest it was
   handed, so every clause the contract gains is a first paint that grows. The
   counting itself is `tallyRows`, on the worker, where a `GROUP BY` belongs.

   ⚠️ AND 56 FOR `actsIn`. The form that RUNS a declared act — `Doing`, four
   kilobytes of it — is not in this number, which is the boundary working: it is
   reached from `Declared`, which is lazy, so a browser that never opens a
   product never downloads a form for one. And 34 for counting the GENERATED
   operations into the set a body may name — without it `supplier.create` was
   refused as undeclared, which is the one act every list screen has.

   ⚠️ AND 662 FOR THE SQL KEYWORDS A FIELD MAY NOT BE NAMED AFTER. A field called
   `from` produces a `CREATE TABLE` SQLite will not parse, so `ensureSchema`
   throws and every door answers 503 — the sharpest failure the kernel can refuse
   at composition, found by naming a test fixture's reference `from`. The list is
   one space-separated string rather than sixty quoted ones, which is worth 109
   bytes of the cost; the rest is the words themselves and it buys an outage.

   ⚠️ AND 603 FOR WHAT THE SCREEN FILLS IN — `Fill`, `ActSpec`, `opOf` and
   `fillsIn`. Without them the first form a declared screen draws asks somebody
   to type the id of the thing they opened: every write in a real product takes
   its subject and the day, and both are facts the screen is standing on. The
   FORM is still not in this number — `Doing` is reached through `Declared`,
   which is lazy — so what is here is the reading of the declaration alone.

   ⚠️ AND 1,672 FOR THE ESCAPE VALVE — `AskedSpec`, the `first` read, `GoSpec`
   and `goOf`, plus the four refusals `refuseView` gained. It is the same trade
   as the hop and the tally, and it is the one that closes the last class of
   screen a declaration could not express: a view is a query with no operator, so
   a screen whose subject is ARITHMETIC — what runs out, what a period totalled —
   had nowhere to come from. The arithmetic itself is not in this number and
   never will be: it is a declared operation, running on the worker, behind the
   same permission and audit row as every other.

   ⚠️ AND 1,095 FOR THE PICKER — `fillOf`, the two new fill sources and the three
   refusals that check them. A `ref` input is an operation asking "which one",
   and the declared form drew a text box: "To" on a transfer meant typing a
   location id somebody would have to find first. The ROWS are not in this
   number — they come down with the screen, sized by the workspace — and neither
   is the control, which is `Lookup` and was already here.

   ⚠️ AND 1,412 FOR THE THIRD KIND OF SCREEN — `SessionSpec`, and the refusals a
   flow and a session now pass through. `StorySpec` had claimed since it was
   written that a guard proved its `writes` was a real operation and that the
   screen's permission was the one that operation demands; nothing did, and the
   first product it was pointed at had a screen offered on a grant its write
   refuses. The CONTROLS of a session are still not in this number and never will
   be — a camera and a viewfinder stay in the app, which is the whole bargain.

   ⚠️ AND THE GZIP CEILING MOVES TO 330,400 FOR THE NARROWING AND THE PLOTS —
   `PickSpec`, `PlotSpec`, the `picked` fill source, and the refusals that check
   a pick nothing narrows and a `plots` on a block that draws none. Both are the
   same bargain the valve struck: a report screen is a period somebody CHOOSES
   and figures drawn as marks, and without a way to say either, the one screen in
   the product whose whole subject is arithmetic stayed a hand-written file. The
   CHARTS are not in this number and will not be — `LineChart` and `BarChart`
   come down with `Declared`, which is lazy — and neither is the narrowing
   control, which is `Segmented` and `Lookup` and was already here. What is here
   is the reading of the declaration: a projection from rows to marks, and one
   control row above a body. Raw goes with it for the same reason — a contract
   read in the browser is parsed before the first frame, and it does not
   compress.

   ⚠️ AND AGAIN TO 1,115,200 / 330,700 FOR THE TWO BLOCKS FED BY THE APP ITSELF
   — `BlockEntry.book`, `BlockSpec.leads`, and the two refusals over them. The
   checklist and the milestones are already declared on every manifest and were
   drawn only by a file each product wrote for itself; making them blocks is
   what let the last two screens stop being files. `Guide` and `Milestones`
   THEMSELVES are not in this number — they moved from `rendered/` to `parts/`
   and come down with `Declared`, which is lazy. */
const CEILING = {
  js: { raw: 1_115_200, gzip: 330_700 },
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
