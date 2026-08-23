/**
 * WHAT A SCREEN ACTUALLY MEASURES, IN A BROWSER — the harness every app uses.
 *
 * ⚠️ SPACING IS THE ONE RULE NO STATIC CHECK CAN SEE. Every guard in this
 * repository reads source: which class was written, which component was
 * composed, which attribute was stamped. None of them can answer "how far is
 * this heading from the card above it", because the answer is a computed value
 * produced by a stylesheet, a flex container, a line-height and four components
 * that each did something reasonable. That is exactly the class of fault this
 * product keeps shipping — sections that run together, a card whose first row
 * sits twice as far down as every other card's — and it is why it keeps coming
 * back after being fixed one instance at a time.
 *
 * ⚠️ SO THE HARNESS RENDERS AND MEASURES. Real markup, the real built
 * stylesheet, real Chromium, at a real phone width — and the assertions are
 * about PIXELS. A screen cannot compose its way out of a rule expressed in the
 * geometry it produces.
 *
 * ⚠️ IT USES THE BUILT STYLESHEET RATHER THAN COMPILING ONE. Tailwind emits only
 * the classes it finds written down, so a stylesheet compiled for the harness
 * would be a different stylesheet from the one that ships — and a spacing rule
 * verified against CSS nobody serves is worth nothing. `dist/assets/index-*.css`
 * is what the browser gets — AND `runtimeCss()`, which is the other half the
 * deployment injects at boot. See `stylesheet`.
 *
 * ⚠️ AND IT IS A `.tsx` RATHER THAN A `.mjs` BECAUSE IT COMPOSES REAL
 * COMPONENTS. A specimen assembled out of hand-written HTML would measure the
 * harness's idea of a card. What is under test is `Group`, `Section`, `Screen`
 * and `Stack` as a screen actually uses them.
 *
 * ⚠️ IT IS IN `src` RATHER THAN IN THIS PACKAGE'S OWN `test` BECAUSE A PRODUCT
 * HAS TO BE ABLE TO POINT IT AT ITS OWN SCREENS. Measured only against library
 * specimens, every rule here is verified on the arrangement that was built to
 * pass it — and the screens somebody actually opens are exactly what nothing
 * looks at. A second copy in each app would be a second answer to which
 * stylesheet ships.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "vite";
import type { Browser } from "playwright";
import type { ReactNode } from "react";
import { runtimeCss } from "../frame/runtime.js";
import { productCss } from "../tokens/theme.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SPA = join(HERE, "..", "..", "..", "one-space", "dist", "assets");

/**
 * ⚠️ THE PHONE, BECAUSE THAT IS WHERE THE COMPLAINTS COME FROM. Every screenshot
 * that has ever been sent about spacing in this product was taken on a phone, and
 * a rhythm that reads on a desktop can be two blocks touching at 390.
 */
export const PHONE = { width: 390, height: 844, deviceScaleFactor: 1 } as const;

/**
 * ⚠️ AND THE DESK, BECAUSE THE TWO FAIL DIFFERENTLY. A phone catches blocks that
 * run together and a row that wraps into three lines; a wide viewport catches a
 * table that pushes the page sideways and a column that stretches to eleven
 * hundred pixels of prose. Neither width finds the other's fault.
 */
export const DESK = { width: 1280, height: 900, deviceScaleFactor: 1 } as const;

/**
 * WHAT THE BROWSER ACTUALLY HAS: the built stylesheet AND what the deployment
 * injects at boot.
 *
 * ⚠️ THE BUILT CSS ALONE IS A DIFFERENT DOCUMENT. The type face, the grounds,
 * the tones and every motion rule are put in by `main.tsx` at runtime because
 * they derive from an accent — so a harness reading `dist` measures a page with
 * no face, where the fallback stack has different metrics and every height and
 * every wrap is somebody else's. `runtimeCss` is the same string the deployment
 * mounts.
 */
export const stylesheet = (): string => `${built()}\n${runtimeCss()}\n${deploymentBrand()}`;

/**
 * ⚠️ AND THE DEPLOYMENT'S OWN COLOUR LAST, WHICH IS WHERE IT LANDS IN THE
 * DOCUMENT. `GROUND_CSS` ships a blue as the colour a deployment has before
 * anybody chooses; One's is a true neutral, and every tier, surface and ambience
 * is a `color-mix` with it — so a harness without it measures and photographs a
 * navy product that nobody is served.
 *
 * ⚠️ READ FROM THE FILE RATHER THAN IMPORTED, because the deployment depends on
 * every app and an app's sweep importing the deployment would be a cycle. A
 * second copy of the value here is how the two come to disagree, so it REFUSES
 * rather than falling back — a photograph of the wrong product is the failure
 * this is here to prevent, and it looks entirely convincing.
 */
const deploymentBrand = (): string => {
  const at = join(HERE, "..", "..", "..", "one-space", "src", "brand.ts");
  const found = /ONE_ACCENT\s*=\s*"([^"]+)"/.exec(readFileSync(at, "utf8"));
  if (!found) {
    throw new Error(
      `no \`ONE_ACCENT = "…"\` in ${at}. The harness reads the deployment's own `
      + `colour from that line — without it every measurement and every `
      + `photograph is of the framework's default brand.`);
  }
  return productCss(found[1] as string);
};

/** ⚠️ Absent is a build that has not run — a harness measuring nothing must say so. */
const built = (): string => {
  const css = readdirSync(SPA).filter((f) => f.startsWith("index-") && f.endsWith(".css"));
  if (css.length !== 1) {
    throw new Error(
      `expected exactly one built stylesheet in ${SPA}, found ${css.length}. `
      + `Run \`pnpm --filter @engine/space build\` — the harness measures the CSS that ships, `
      + `not one compiled for itself.`);
  }
  return readFileSync(join(SPA, css[0]!), "utf8");
};

/**
 * ⚠️ THE THEME IS STAMPED, because `data-theme` is what selects dark and nothing
 * in a server-rendered fragment stamps it. Measured undressed, every token falls
 * back and the numbers are a different product's.
 *
 * ⚠️ AND MOTION IS STOOD DOWN, BECAUSE WHAT IS UNDER TEST IS WHERE THINGS REST.
 * A block arrives translated half a rem, staggered by its position, and holds
 * that offset until its delay elapses — so a screen measured while it is
 * arriving reports a rhythm of 26 and 29 where the scale says 24, and the
 * numbers depend on how fast the machine is. That is the `waitForTimeout` fault
 * one layer down: a reading taken at a position the product never holds still
 * in. It is also not a fiction — it is exactly the document somebody with
 * reduced motion is served.
 */
export const pageFor = (markup: string, css: string, theme: "dark" | "light" = "dark"): string =>
  `<!doctype html><html data-theme="${theme}" data-reduce-motion="true">`
  + `<head><meta charset="utf-8">`
  + `<style>${css}</style>`
  + `<style>html,body{margin:0;padding:0}</style>`
  + `</head><body>${markup}</body></html>`;

export const html = (node: ReactNode): string => renderToStaticMarkup(node);

/* ------------------------------------------------------------- for real --- */

/**
 * A SCREEN THAT HAS ACTUALLY RUN, RATHER THAN ONE RENDERED TO A STRING.
 *
 * ⚠️ AN EFFECT IS INVISIBLE TO `renderToStaticMarkup`, AND THE CROWN IS AN
 * EFFECT. A sub-page hands its name, its way back and its actions UP to the
 * shell's crown from a layout effect (`useCrownSocket`) — so rendered statically
 * it draws neither its own crown nor a heading, and every screen somebody
 * navigated INTO photographs and measures with nothing saying where they are.
 * Six of OneInventory's nineteen are that shape.
 *
 * ⚠️ SO THE PAGE RUNS THE PRODUCT. Vite is already here — it is what vitest runs
 * on — the bundle is a few hundred milliseconds, and what the browser executes
 * is the component that ships rather than a paraphrase of it.
 */
export interface Live {
  /** The IIFE from `mounted`. */
  readonly code: string;
  /** ⚠️ What to show, read by the mount file off `window`. */
  readonly route: string;
}

export const isLive = (what: ReactNode | Live): what is Live =>
  typeof what === "object" && what !== null && "code" in what && "route" in what;

const made = new Map<string, string>();

/**
 * ⚠️ BUILT ONCE PER ENTRY, and keyed by it. The bundle does not change between
 * tests, and a second caller wanting a different component must not be handed
 * the first one's — which is what a single cached string did.
 */
export async function mounted(entry: string): Promise<string> {
  const held = made.get(entry);
  if (held) return held;
  const out = await build({
    logLevel: "silent",
    /*
      ⚠️ NO PROJECT CONFIG, SO THE BUILD IS THE SAME ONE WHEREVER IT IS RUN FROM.
      Vite loads the nearest `vite.config.ts` by default, which for the
      deployment carries the entry-size budget every visitor's download is
      measured against — and a harness bundle is ONE unsplit IIFE of everything,
      so it fails that budget by construction and takes the sweep down with a
      message about a chunk nobody ships. A test that cannot run in one package
      and can in another is a test whose result is about the directory.
    */
    configFile: false,
    /* ⚠️ THE SAME JSX SETTING THE SUITES USE. Vite's esbuild handles `.tsx` on
       its own; the React plugin exists for fast refresh, which a build that runs
       once and is thrown away has no use for. */
    esbuild: { jsx: "automatic" },
    /*
      ⚠️ REACT READS `process.env.NODE_ENV`, AND A BARE PAGE HAS NO `process`.
      Vite's app build defines this for you; a library build does not, so the
      bundle throws `process is not defined` before it draws anything — an empty
      page and a test that times out waiting for an element, with nothing saying
      why. Development, because a failure in the harness should say what it was.
    */
    define: { "process.env.NODE_ENV": JSON.stringify("development") },
    build: {
      write: false,
      lib: { entry, formats: ["iife"], name: "Harness", fileName: () => "h.js" },
    },
  });
  const chunks = Array.isArray(out) ? out[0]! : out;
  const code = (chunks as { output: { code?: string }[] }).output
    .map((o) => o.code ?? "").join("\n");
  made.set(entry, code);
  return code;
}

/**
 * ⚠️ THE ROUTE GOES IN BEFORE THE BUNDLE, so the mount file can read it on its
 * first line. Passing it afterwards would mean every mount file needing a
 * re-render hook, which is a second mechanism for the one thing this has to do.
 */
const pageMounting = (live: Live, css: string, theme: "dark" | "light"): string =>
  `<!doctype html><html data-theme="${theme}" data-reduce-motion="true">`
  + `<head><meta charset="utf-8">`
  + `<style>${css}</style>`
  + `<style>html,body{margin:0;padding:0}</style>`
  + `</head><body><div id="root"></div>`
  + `<script>window.__ROUTE=${JSON.stringify(live.route)}</script>`
  + `<script>${live.code}</script></body></html>`;

/**
 * ⚠️ WAITED FOR, NOT ASSUMED. A bundle that threw draws nothing, and a page
 * measured empty reports no overflow and no small controls — a green sweep of a
 * blank document, which is the failure this whole harness exists to catch.
 */
async function show(
  page: { setContent: (html: string) => Promise<void>;
    waitForFunction: (fn: () => boolean, arg?: unknown, opts?: { timeout: number }) => Promise<unknown> },
  what: ReactNode | Live, css: string, theme: "dark" | "light",
): Promise<void> {
  if (!isLive(what)) {
    await page.setContent(pageFor(html(what), css, theme));
    return;
  }
  await page.setContent(pageMounting(what, css, theme));
  await page.waitForFunction(
    () => (document.getElementById("root")?.children.length ?? 0) > 0, undefined, { timeout: 20_000 });
}

/* ------------------------------------------------------------- what it is --- */

/**
 * ⚠️ 44 PIXELS, WHICH IS THE SMALLEST BOX A FINGER RELIABLY HITS — and the
 * number `ROW.tap`'s paragraph already calls non-negotiable. It is a floor on a
 * mouse too: a 32px control is one people miss on a laptop.
 */
export const FINGER = 44;

/** What one render of one screen, at one width, actually laid out. */
export interface Geometry {
  /** How far the document can be scrolled sideways. Anything over zero is a bug. */
  readonly spill: number;
  /** The widest thing that stuck out, and what it said — so a failure names it. */
  readonly worst: { readonly tag: string; readonly right: number; readonly text: string } | null;
  /** Every control somebody has to hit, with the box they have to hit it in. */
  readonly targets: readonly {
    readonly text: string; readonly width: number; readonly height: number;
    /** ⚠️ What the library calls it — see `tooSmall` for the one thing it is for. */
    readonly kind: string;
  }[];
  /**
   * ⚠️ TEXT THE LAYOUT CUT OFF, AND WHERE. Truncation is often the right answer
   * — a product name in a row has to end somewhere — and never the right answer
   * for a control, where the words ARE what the press does. "Import 3 …" is a
   * button nobody can act on with confidence, and it looks deliberate.
   *
   * `where` is the nearest ancestor that marks a region: the island, the nav,
   * the crown. An app asserts about the regions where cutting is never allowed
   * rather than about the whole page.
   */
  readonly cut: readonly {
    readonly text: string; readonly by: number; readonly where: string;
  }[];
  /**
   * EVERY SIZE OF TYPE THE SCREEN ACTUALLY SET, LOUDEST FIRST.
   *
   * ⚠️ THE ONE RULE ABOUT TYPE THAT NO STATIC CHECK CAN SEE. `motion` refuses a
   * screen that writes its own `text-2xl`, and `ranks` proves the three heading
   * roles come out as three sizes — both read source, and neither can answer
   * "how many different sizes are on this page". That number is what separates a
   * screen with a typographic system from one assembled out of defensible local
   * decisions: nine sizes on one page is not a scale, whoever owns each of them.
   *
   * ⚠️ AND IT IS ONE ENTRY PER SIZE, NOT PER ELEMENT. What is under test is the
   * SET — a list of forty rows at one size is a scale of one, and reporting forty
   * of them would make every list look like the fault.
   *
   * `text` is a sample from the largest element at that size, so a failure names
   * something somebody can find on the screen rather than a number.
   */
  readonly type: readonly {
    readonly px: number; readonly weight: number;
    readonly count: number; readonly text: string;
  }[];
}

/**
 * ⚠️ THE ONE EXEMPTION, AND IT IS WRITTEN DOWN RATHER THAN QUIET. A tag's remove
 * cross is 12px and a search field's clear is 20px, both INSIDE a control that
 * is itself a target: the chip is what a finger goes for and the cross is the
 * precise second half of it. Raising them to 44 would resize every chip in every
 * product — the glyph is the chip's height — and the correct fix is a hit area
 * larger than the glyph, which is a design decision about which of two nested
 * targets wins rather than a number.
 *
 * ⚠️ IT CAN ONLY SHRINK. An entry that stops appearing is an entry to delete; a
 * new one is a decision somebody makes here, in review, rather than a control
 * that quietly slipped under the floor.
 */
export const INSIDE_A_CONTROL = ["tag__remove-button", "search-field__clear-button"];

/**
 * ⚠️ ONE ANSWER TO "IS THIS BIG ENOUGH", SO TWO PRODUCTS CANNOT DISAGREE. An
 * app applying the floor itself would also have to carry the exemption, and the
 * first one to forget reports a screen full of faults nobody can act on.
 */
export const tooSmall = (targets: Geometry["targets"]): Geometry["targets"] =>
  targets.filter((t) => t.height < FINGER
    && !INSIDE_A_CONTROL.some((one) => t.kind.includes(one)));

/**
 * ⚠️ HOW MANY SIZES A SCREEN MAY SET, AND IT IS A CEILING RATHER THAN A TARGET.
 * `TYPE` publishes fifteen roles and no screen wears them all: measured across
 * the proving ground, a screen sets three sizes and a dense one sets six. Seven
 * is the first number no screen in this deployment reaches — which is what makes
 * it an assertion about drift rather than about the design.
 *
 * ⚠️ SIZES, NOT SIZE-AND-WEIGHT PAIRS. Three weights at 16px is `label`, `group`
 * and `body` doing their jobs; three SIZES between 14 and 20 is a screen that
 * picked. The pair count runs about half again as high and says less.
 */
export const SCALE_CEILING = 7;

/**
 * ⚠️ HOW MUCH TEXT A SCREEN NEEDS BEFORE "IT HAS NO HIERARCHY" MEANS ANYTHING.
 * An empty state is four lines — a mark, a sentence, a hint and one button — and
 * the largest of them IS the message, so asking it to outrank a body it does not
 * have reports a fault on the one screen in the system that is correct by
 * construction. Measured: OneInventory's `/where` on an empty location comes back
 * with four elements at four sizes, which is a scale, and it failed the top.
 */
export const ENOUGH_TO_RANK = 8;

/** What one screen's type amounts to: the sizes it set, and whether it has a top. */
export interface Scale {
  /** Every distinct size, loudest first. */
  readonly sizes: readonly number[];
  /** The size the most elements on the screen wear — the screen's body. */
  readonly commonest: number;
  /** How many elements set type at all — see `ENOUGH_TO_RANK`. */
  readonly pieces: number;
}

/**
 * ⚠️ ONE READING FOR EVERY PRODUCT, FOR THE REASON `tooSmall` GIVES: an app that
 * counted for itself would be a second answer to what a scale is, and the first
 * one to count pairs instead of sizes reports a page full of faults nobody can
 * act on.
 */
export const scaleOf = (type: Geometry["type"]): Scale => {
  const sizes = [...new Set(type.map((t) => t.px))].sort((a, b) => b - a);
  /* ⚠️ PER SIZE, NOT PER SIZE-AND-WEIGHT. Three weights at 16px are `label`,
     `group` and `body`, and counting them apart splits a screen's body three
     ways — which is how the loudest thing comes to look commonest. */
  const worn = new Map<number, number>();
  for (const one of type) worn.set(one.px, (worn.get(one.px) ?? 0) + one.count);
  /* ⚠️ A TIE GOES TO THE SMALLER SIZE, because a body is the quiet half of one.
     Resolved the other way, a screen with one heading and one line of prose
     reports the heading as its body and fails a rule it passes. */
  let commonest = 0;
  let most = 0;
  for (const [px, count] of [...worn].sort((a, b) => a[0] - b[0])) {
    if (count > most) { most = count; commonest = px; }
  }
  return { sizes, commonest, pieces: type.reduce((n, one) => n + one.count, 0) };
};

/**
 * WHAT A SCREEN LAID OUT, AT ONE WIDTH.
 *
 * ⚠️ ONE FUNCTION FOR EVERY PRODUCT, BECAUSE THE QUESTION IS THE SAME ONE. A
 * copy per app is a second answer to what counts as off-canvas — and the
 * exemptions below are the whole subtlety: a screen-reader-only label lives
 * outside the viewport on purpose, and a table inside its own scroller is the
 * correct answer rather than a fault. An app deciding those for itself gets one
 * of them wrong and reports green.
 *
 * ⚠️ AND IT MEASURES AFTER A FRAME. Fonts and the ambience layer both move
 * geometry; a number taken straight after `setContent` is one that happens to be
 * right on a fast machine.
 */
export async function geometryOf(
  browser: Browser, what: ReactNode | Live, css: string,
  viewport: { width: number; height: number },
): Promise<Geometry> {
  const page = await browser.newPage({ viewport });
  try {
    await show(page, what, css, "dark");
    await page.evaluate(() => new Promise((go) => requestAnimationFrame(() => go(null))));
    return await page.evaluate((width) => {
      const spill = Math.max(0, document.documentElement.scrollWidth - width);
      let worst: { tag: string; right: number; text: string } | null = null;
      for (const el of Array.prototype.slice.call(document.querySelectorAll("body *")) as Element[]) {
        const box = el.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        const style = getComputedStyle(el);
        /* Deliberately outside the page: a fixed dock, a hidden thing, an
           sr-only label clipped to a pixel. None of them is off-canvas. */
        if (style.position === "fixed" || style.visibility === "hidden") continue;
        if (style.clipPath && style.clipPath !== "none") continue;
        /* Wide content inside its own scroller is the correct answer. */
        let scrolls = false;
        for (let up = el.parentElement; up; up = up.parentElement) {
          const how = getComputedStyle(up).overflowX;
          if (how === "auto" || how === "scroll" || how === "hidden") { scrolls = true; break; }
        }
        if (scrolls) continue;
        if (box.right > width + 1 && (!worst || box.right > worst.right)) {
          worst = {
            tag: el.tagName.toLowerCase(),
            right: Math.round(box.right),
            text: (el.textContent ?? "").trim().slice(0, 40),
          };
        }
      }
      const targets = (Array.prototype.slice.call(
        document.querySelectorAll("button, a[href], [role='button']")) as Element[])
        .map((el) => {
          const box = el.getBoundingClientRect();
          return {
            text: (el.textContent ?? "").trim().slice(0, 30) || el.tagName.toLowerCase(),
            width: Math.round(box.width),
            height: Math.round(box.height),
            kind: typeof el.className === "string" ? el.className : "",
          };
        })
        .filter((t) => t.width > 0 && t.height > 0);
      /* ⚠️ ELLIPSIS ONLY, NOT EVERY OVERFLOW. A scroller's content is wider than
         its box on purpose, and a clipped decoration is not text somebody was
         meant to read; what this is looking for is the layout deciding, on its
         own, that some of the words go. */
      const cut = (Array.prototype.slice.call(document.querySelectorAll("body *")) as Element[])
        .filter((el) => {
          const style = getComputedStyle(el);
          if (style.textOverflow !== "ellipsis") return false;
          return el.scrollWidth > el.clientWidth + 1;
        })
        .map((el) => {
          const marked = el.closest("[data-island], [data-hem], [data-crown], nav");
          return {
            text: (el.textContent ?? "").trim().slice(0, 40),
            by: el.scrollWidth - el.clientWidth,
            where: marked
              ? (marked.getAttribute("data-island") ? "island"
                : marked.getAttribute("data-crown") ? "crown"
                  : marked.tagName === "NAV" ? "nav" : "hem")
              : "",
          };
        });
      /* ⚠️ THE ELEMENT THAT SETS THE TYPE, NOT EVERY ANCESTOR OF IT. A card holds
         a heading and four rows: asking the card what size it is answers with
         whatever it inherits, and the page comes out with one size per nesting
         level. Only an element with a direct text node of its own is setting
         type anybody reads.

         ⚠️ AND AN INVISIBLE ONE IS NOT ON THE SCREEN. A screen-reader label is
         clipped to a pixel on purpose and a curtain is `visibility: hidden`;
         either would add a size to the count that nobody can see. A skeleton
         needs no exemption — it holds no text, so it never sets a size. */
      const sizes = new Map<string, { px: number; weight: number; count: number; text: string; area: number }>();
      for (const el of Array.prototype.slice.call(document.querySelectorAll("body *")) as Element[]) {
        const own = Array.prototype.slice.call(el.childNodes)
          .filter((n: ChildNode) => n.nodeType === 3 && (n.textContent ?? "").trim())
          .map((n: ChildNode) => (n.textContent ?? "").trim())
          .join(" ");
        if (!own) continue;
        /* ⚠️ NOT A CHART'S OWN LABELS. SVG text is sized in the viewBox's units,
           so its computed size is not the size anybody sees — a chart drawn at
           320 units into a 390-pixel column renders its 8 at nearly 10. Counting
           them here would mix two coordinate systems into one number and make it
           mean nothing. What a chart may set is `CHART_TYPE`, and `motion`
           refuses any other size in source. */
        if (el.closest("svg")) continue;
        const style = getComputedStyle(el);
        if (style.visibility === "hidden" || style.display === "none") continue;
        if (style.clipPath && style.clipPath !== "none") continue;
        const box = el.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        const px = Math.round(parseFloat(style.fontSize));
        const weight = Number(style.fontWeight) || 400;
        const key = `${px}/${weight}`;
        const held = sizes.get(key);
        const area = box.width * box.height;
        if (!held) sizes.set(key, { px, weight, count: 1, text: own.slice(0, 40), area });
        else {
          held.count += 1;
          if (area > held.area) { held.area = area; held.text = own.slice(0, 40); }
        }
      }
      /* ⚠️ `Array.from`, NOT `slice.call`. A Map's `values()` is an iterator with
         no `length`, so `Array.prototype.slice.call` on it returns an empty
         array — silently, on every screen, which reads as a page with no type. */
      const type = Array.from(sizes.values())
        .map((s: { px: number; weight: number; count: number; text: string }) =>
          ({ px: s.px, weight: s.weight, count: s.count, text: s.text }))
        .sort((a: { px: number }, b: { px: number }) => b.px - a.px);
      return { spill, worst, targets, cut, type };
    }, viewport.width);
  } finally {
    await page.close();
  }
}

/* ---------------------------------------------------------- what it looks --- */

/* ------------------------------------------------------------- the world --- */

/** What a scene actually resolved to, on a page that really rendered. */
export interface World {
  /** The family the shell chose, or null where no element carries one. */
  readonly sky: string | null;
  /** ⚠️ Whether the shell FOUND the screen. Null is the fault this exists for. */
  readonly named: boolean;
  readonly wash: boolean;
  /** The resolved custom properties, so a `none` is distinguishable from a miss. */
  readonly ground: string;
  readonly flare: string;
  readonly brand: string;
  /** The flare's own element: whether it is there, and whether it PAINTS. */
  readonly lit: { readonly on: boolean; readonly area: number; readonly paints: boolean };
  /**
   * ⚠️ WHETHER THE SOURCE CHANGES WHAT IS ON THE SCREEN, which is the only
   * question worth asking about a light. The share of bytes that differ between
   * the page as drawn and the same page with `--world-flare` suppressed — zero
   * means the family declared a source, resolved it, gave it an element with a
   * box, and painted something no eye can find.
   */
  readonly visible: number;
}

/**
 * WHAT THE WORLD BEHIND A SCREEN ACTUALLY CAME OUT AS.
 *
 * ⚠️ EVERY OTHER CHECK IN THIS PACKAGE ASKS WHETHER SOMETHING IS DECLARED, AND
 * THIS ASKS WHETHER IT IS PAINTED. An ambience is the one part of the interface
 * with no text to assert, no box to measure and no control to press — so a world
 * that resolved to `none` looks exactly like a world that is quiet, and a screen
 * whose sky was never chosen looks exactly like a screen that chose `plain`. All
 * three shipped at once, and what was on the page was the fallback ground.
 *
 * ⚠️ IT READS THE PIXELS, NOT ONLY THE PROPERTIES. A `--world-flare` holding a
 * real gradient still paints nothing if the layer is behind an opaque parent or
 * has no box, and a token check would pass through all of it — which is what a
 * property-only version of this test would have done to the very bug it was
 * written for.
 */
export async function worldOf(
  browser: Browser, what: ReactNode | Live, css: string,
  viewport: { width: number; height: number }, theme: "dark" | "light" = "dark",
): Promise<World> {
  const page = await browser.newPage({ viewport });
  try {
    await show(page, what, css, theme);
    await page.evaluate(() => new Promise((go) => requestAnimationFrame(() => go(null))));

    const seen = await page.evaluate(() => {
      const sky = document.querySelector("[data-sky]");
      const flare = document.querySelector("[data-flare]");
      const of = sky ? getComputedStyle(sky) : null;
      const box = flare?.getBoundingClientRect();
      const paint = flare ? getComputedStyle(flare).backgroundImage : "none";
      return {
        sky: sky?.getAttribute("data-sky") ?? null,
        named: !!sky?.getAttribute("data-sky"),
        wash: sky?.getAttribute("data-wash") === "true",
        ground: (of?.getPropertyValue("--world-ground") ?? "").trim(),
        flare: (of?.getPropertyValue("--world-flare") ?? "").trim(),
        brand: (of?.getPropertyValue("--brand") ?? "").trim(),
        lit: {
          on: !!flare,
          area: Math.round((box?.width ?? 0) * (box?.height ?? 0)),
          paints: paint !== "none" && paint !== "",
        },
      };
    });
    /*
      ⚠️ THE LIGHT IS MEASURED BY TAKING IT AWAY, because nothing else can see
      it. A gradient resolves, an element has a box, a background-image is set —
      and the flare wears a steep mask, so a source the seed placed past the
      ramp is drawn in full and removed in full, with every property reading
      correctly. Two photographs, one with the source suppressed: if they are
      the same picture, there is no light on the screen.

      ⚠️ ANIMATIONS OFF FOR BOTH, or the two differ by whatever moved between
      them and every world passes.
    */
    const lit = await page.screenshot({ animations: "disabled" });
    await page.evaluate(() => {
      const el = document.querySelector("[data-sky]") as HTMLElement | null;
      el?.style.setProperty("--world-flare", "none");
    });
    await page.evaluate(() => new Promise((go) => requestAnimationFrame(() => go(null))));
    const dark = await page.screenshot({ animations: "disabled" });
    const n = Math.min(lit.length, dark.length);
    let off = lit.length === dark.length ? 0 : Math.abs(lit.length - dark.length);
    for (let i = 0; i < n; i++) if (lit[i] !== dark[i]) off++;
    const visible = off / Math.max(1, Math.max(lit.length, dark.length));

    return { ...seen, visible };
  } finally {
    await page.close();
  }
}

/**
 * ONE PHOTOGRAPH OF ONE SCREEN, AT ONE WIDTH, IN ONE THEME.
 *
 * ⚠️ THE SAME DOCUMENT THE MEASURING USES, WHICH IS THE WHOLE POINT OF IT BEING
 * HERE. A second way to put a screen in a browser is a second answer to which
 * stylesheet ships — and the image is the one artefact nobody diffs, so a shot
 * taken through a slightly different page is a convincing photograph of a
 * product that does not exist.
 *
 * ⚠️ THE VIEWPORT, NOT THE WHOLE PAGE. A `fullPage` capture unpins everything
 * that is `sticky` or `fixed` — the dock lands wherever the document ends and
 * reads as a control overlapping the text above it. What is being photographed
 * is what somebody sees, and somebody sees a viewport.
 *
 * ⚠️ AND IT RETURNS THE PATH IT WROTE, so a caller can assert a file exists
 * rather than trusting a run that printed encouraging lines.
 */
export async function shoot(
  browser: Browser, what: ReactNode | Live, css: string,
  viewport: { width: number; height: number },
  theme: "dark" | "light",
  to: string,
): Promise<string> {
  const page = await browser.newPage({ viewport });
  try {
    await show(page, what, css, theme);
    /* ⚠️ A frame, for the same reason the measuring waits for one: fonts and the
       ambience layer both land after the first paint. */
    await page.evaluate(() => new Promise((go) => requestAnimationFrame(() => go(null))));
    await page.screenshot({ path: to });
    return to;
  } finally {
    await page.close();
  }
}

/* ------------------------------------------------------------- when it is --- */

/**
 * WAIT UNTIL A THING HAS STOPPED MOVING, RATHER THAN FOR A NUMBER OF
 * MILLISECONDS.
 *
 * ⚠️ A `waitForTimeout` IS A GUESS ABOUT A MACHINE, AND IT IS WRONG UNDER LOAD.
 * "Sleep 500ms, the sheet will have arrived" holds until something else is using
 * the processor — and then the sheet is measured mid-slide, at a position it
 * never rests in, and the failure is about the runner rather than the product.
 * That is the flake this repository already refuses to answer with `retry`:
 * a retry is what a suite has instead of isolation, and for a moving thing
 * isolation means waiting for the MOTION rather than for the clock.
 *
 * ⚠️ TWO AGREEING FRAMES, NOT ONE. A single sample can land on the pause between
 * two stages of a sequence; two consecutive frames at the same position is the
 * cheapest reading of "it has settled" that a stage boundary cannot pass.
 */
export async function stillness(
  page: { evaluate: <T>(fn: (arg: string) => T, arg: string) => Promise<T> },
  selector: string,
  patience = 5_000,
): Promise<void> {
  const settled = await page.evaluate((sel: string) => new Promise<boolean>((done) => {
    const of = () => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return `${Math.round(r.top)}:${Math.round(r.left)}:${Math.round(r.width)}:${Math.round(r.height)}`;
    };
    let last: string | null = null;
    let same = 0;
    const started = Date.now();
    const tick = () => {
      const now = of();
      if (now !== null && now === last) same += 1; else same = 0;
      last = now;
      if (same >= 2) { done(true); return; }
      if (Date.now() - started > 5_000) { done(false); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), selector);
  if (!settled) throw new Error(`${selector} never stopped moving within ${patience}ms`);
}
