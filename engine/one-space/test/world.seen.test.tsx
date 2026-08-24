/**
 * THE WORLD BEHIND THE SCREEN THE DEPLOYMENT ACTUALLY SERVES.
 *
 * ⚠️ THIS IS THE ONLY SUITE THAT MOUNTS THE LIVE SURFACE, AND IT EXISTS BECAUSE
 * EVERYTHING ELSE MOUNTS A GROUND. `Ground` and every app's own hand `Shell` the
 * manifest's screens unrewritten and the app's own route; the deployment rewrites
 * every screen into `/<app>/…` and has to hand the shell an address in that same
 * space. When it did not, the shell could not find the screen it was DRAWING —
 * so the page had no title, no nav row, no foot and no sky, and the world fell
 * through to the product's default ground. Every suite stayed green, every
 * photograph looked right, and the fault reached a person's phone.
 *
 * ⚠️ AN AMBIENCE IS THE ONE PART OF THE INTERFACE WITH NOTHING TO ASSERT. No
 * text, no box, no control — so a world that resolved to `none` reads exactly
 * like a world that is quiet, and a screen whose sky was never chosen reads
 * exactly like a screen that chose `plain`. That is why these assertions are
 * about PIXELS as well as properties: a `--world-flare` holding a real gradient
 * still paints nothing if its layer has no box or sits behind an opaque parent,
 * and a property-only check would have passed the very bug this was written for.
 *
 * ⚠️ AND IT IS THE REAL MANIFEST, NOT A FIXTURE. What is being checked is that a
 * product's own declarations — `hue`, and a screen's `sky` — survive the whole
 * distance from the manifest to a painted pixel. A fixture would prove the
 * mechanism works for a fixture.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PHONE, DESK, mounted, stylesheet, worldOf } from "@engine/design/measuring";
import { INVENTORY } from "@engine/inventory";

const HERE = dirname(fileURLToPath(import.meta.url));

let browser: Browser;
let css: string;
let code: string;
beforeAll(async () => {
  css = stylesheet();
  code = await mounted(join(HERE, "product.mount.tsx"));
  browser = await chromium.launch();
}, 180_000);
afterAll(async () => { await browser?.close(); });

/**
 * ⚠️ THE ADDRESSES A BROWSER ACTUALLY HOLDS, WHICH IS THE HALF THAT BROKE. The
 * bare root is where a person with one product lands and is the one address that
 * is not the screen's own route — so it goes first, and every screen naming a
 * sky follows. A screen's world is seeded on its own identity, so each of these
 * is a different world and any one of them can be the invisible one.
 */
const LANDS = [
  { path: "/", sky: (INVENTORY.screens ?? []).find((s) => s.route === "/")?.sky },
  ...(INVENTORY.screens ?? [])
    .filter((s) => s.sky && s.sky !== "plain" && s.route !== "/")
    .map((s) => ({ path: `/${INVENTORY.id}${s.route}`, sky: s.sky })),
].filter((one): one is { path: string; sky: string } => !!one.sky);

describe("the world a person actually opens", () => {
  it("has screens to check at all", () => {
    expect(LANDS.length, "no screen in OneInventory names a sky, so this suite checks nothing")
      .toBeGreaterThan(2);
  });

  for (const { path, sky } of LANDS) {
    it(`draws the sky the manifest names, at ${path}`, async () => {
      const world = await worldOf(browser, { code, route: path }, css, PHONE);

      /*
        ⚠️ THE SHELL FOUND THE SCREEN, WHICH IS THE ROOT OF ALL FOUR SYMPTOMS. A
        missing `data-sky` is not "the ambience is off" — it is the shell unable
        to say which screen it is on, so the title, the nav row and the foot are
        wrong in the same breath.
      */
      expect(world.named, `${path}: the shell found no screen for this address, `
        + `so nothing chose a sky`).toBe(true);
      expect(world.sky, `${path} draws "${world.sky}" and the manifest says "${sky}"`).toBe(sky);
      expect(world.ground, `${path}: the ground resolved to nothing`).not.toBe("none");
    }, 90_000);
  }

  /*
    ⚠️ AND A SOURCE A FAMILY DECLARES IS VISIBLE — ON EVERY SEED, WHICH IS THE
    ASSERTION NOTHING HAD. A family places its light from a seed, and a seed that
    put the source past the flare's steep mask produced a screen with every
    property resolving correctly and no light on it: the gradient was real, the
    element had a box, the background-image was set, and the page was black. The
    only way to see a light is to take it away and check the picture changed.

    ⚠️ AND MOST FAMILIES DECLARE NONE, WHICH IS NOT A FAILURE. `glow` and `etch`
    are a haze in the ground rather than a source on its own layer — so the
    branch here is the pairing itself: a family that declares a source has to
    show it, and one that does not still has to have a ground. Asserting a flare
    on every world would make four quiet families fail for being quiet.
  */
  for (const { path } of LANDS) {
    it(`puts its light on the screen at ${path}, not only in the tokens`, async () => {
      const world = await worldOf(browser, { code, route: path }, css, PHONE);
      if (world.flare === "none") {
        expect(world.lit.on, `${path}: a [data-flare] element for a family with no source`)
          .toBe(false);
        expect(world.ground, `${path}: no source AND no ground is a world that is not there`)
          .not.toBe("none");
        return;
      }
      expect(world.lit.on, `${path}: a source is declared and no [data-flare] element carries it`)
        .toBe(true);
      expect(world.lit.area, `${path}: the flare has no box`).toBeGreaterThan(PHONE.width * 200);
      expect(world.visible, `${path}: suppressing the source changes nothing on the screen — `
        + `the light is drawn and masked away, and every token reads correctly`)
        .toBeGreaterThan(0.02);
    }, 90_000);
  }

  /*
    ⚠️ THE PRODUCT'S COLOUR REACHES THE PAGE, AND `--brand` IS WHERE. Every family
    reads its `lit` slot from it, so a hue that stops here is a world drawn in the
    deployment's own neutral — which is a correct-looking screen of the wrong
    product.
  */
  it("paints the product's own colour, not the deployment's floor", async () => {
    const world = await worldOf(browser, { code, route: "/" }, css, PHONE);
    expect(world.brand.replace(/\s/g, ""),
      `--brand is "${world.brand}" and the manifest declares "${INVENTORY.hue}"`)
      .toBe((INVENTORY.hue ?? "").replace(/\s/g, ""));
    expect(world.wash, "a family publishing a wash left `data-wash` unset").toBe(true);
  }, 90_000);

  /*
    ⚠️ THE CHROME ANSWERS BEFORE ANYBODY SCROLLS, AND THAT IS NOT FREE. Both
    hems are driven by a scroll reading — "is anything behind the crown", "is
    anything still below the fold" — and a reading taken only in a scroll
    handler does not exist until somebody scrolls. The foot's hem then sat at
    its default on a page nobody had touched, and the first flick of a thumb
    made a vignette appear that should have been there on arrival.

    ⚠️ IT IS THIS SUITE BECAUSE IT IS THE ONLY ONE THAT MOUNTS `Page`. The
    listener lives there; a `Shell` rendered on its own has the layers and
    nothing driving them, so every hem reads its safe default and the fault is
    invisible. Asserted at rest, with the page never scrolled.
  */
  it("hems its foot before anybody has scrolled", async () => {
    const page = await browser.newPage({ viewport: PHONE });
    await page.setContent(`<!doctype html><html data-theme="dark"><head><style>${css}`
      + `</style></head><body><div id="root"></div>`
      + `<script type="module">${code}</script></body></html>`);
    await page.waitForSelector('[data-hem="bottom"]');
    await page.waitForTimeout(400);
    const at = await page.evaluate(() => {
      const read = (edge: string) => {
        const el = document.querySelector(`[data-hem="${edge}"]`);
        return el ? Number(getComputedStyle(el, "::before").opacity) : null;
      };
      return { top: read("top"), foot: read("bottom"),
        scrolled: document.scrollingElement?.scrollTop ?? 0 };
    });
    await page.close();
    expect(at.scrolled, "the page was scrolled, so this proves nothing").toBe(0);
    /* ⚠️ The foot ON, because a tall page has content under the nav from the
       first frame — that is what the veil is for. */
    expect(at.foot, "the foot's veil is not there until somebody scrolls").toBe(1);
    /* ⚠️ And the head OFF, for the mirror-image reason: nothing has passed
       under the crown yet, so an opaque strip up there is a bar, not a hem. */
    expect(at.top, "the head's veil is on with nothing behind it to dissolve").toBe(0);
  }, 90_000);

  /*
    ⚠️ AND IT ANSWERS AGAIN WHEN THE PAGE CHANGES SHAPE, WHICH IS NOT THE SAME
    QUESTION. Reading once at mount is right for a page that arrives finished
    and wrong for every page that does not: a list resolving turns a screen that
    fitted into one that does not, and neither a scroll event nor a resize event
    fires for that. Nothing moves, nothing is touched, and the veil stays at the
    answer to a question that stopped being true.
  */
  it("hems its foot when the page grows under it, untouched", async () => {
    const page = await browser.newPage({ viewport: PHONE });
    await page.setContent(`<!doctype html><html data-theme="dark"><head><style>${css}`
      + `</style></head><body><div id="root"></div>`
      + `<script>window.__GROW = true</script>`
      + `<script type="module">${code}</script></body></html>`);
    await page.waitForSelector('[data-hem="bottom"]');
    /* ⚠️ READ FIRST, THEN GROW — see `product.mount.tsx`. The fixture used to
       grow on a timer, so this reading raced it and the test failed on its own
       precondition whenever the machine was busy. */
    await page.waitForFunction(() => typeof window.__grow === "function");
    const short = await page.evaluate(() => Number(
      getComputedStyle(document.querySelector('[data-hem="bottom"]')!, "::before").opacity));
    await page.evaluate(() => { window.__grow?.(); });
    await page.waitForTimeout(600);
    const grown = await page.evaluate(() => ({
      foot: Number(getComputedStyle(
        document.querySelector('[data-hem="bottom"]')!, "::before").opacity),
      over: (document.scrollingElement?.scrollHeight ?? 0) > window.innerHeight,
      scrolled: document.scrollingElement?.scrollTop ?? 0,
    }));
    await page.close();
    expect(short, "the page did not start short, so this proves nothing").toBe(0);
    expect(grown.over, "the page never grew past the fold").toBe(true);
    expect(grown.scrolled, "the page was scrolled, so this proves nothing").toBe(0);
    expect(grown.foot, "content grew under the nav and the veil never came back")
      .toBe(1);
  }, 90_000);

  /*
    ⚠️ AND IT ARRIVES BY DEGREES, NOT AS A SWITCH. The strength is the amount of
    page behind the hem, so scrolling a little from the top brings a little of it
    — which is the whole difference between a vignette and a bar appearing. As a
    boolean it snapped on at 8px and eased over a quarter of a second, so the
    first flick of a thumb produced a dark strip arriving under its own steam
    while the page moved under a different one.

    ⚠️ THE MIDDLE OF THE RAMP IS WHAT THIS PINS, because both ENDS are the same
    either way. A value that is 0 at the top and 1 further down is satisfied by
    the switch this replaced; a value strictly between them, at a scroll offset
    inside the veil's own depth, is only produced by a ramp.
  */
  it("brings its hem on by degrees, not as a switch", async () => {
    const page = await browser.newPage({ viewport: PHONE });
    await page.setContent(`<!doctype html><html data-theme="dark"><head><style>${css}`
      + `</style></head><body><div id="root"></div>`
      + `<script type="module">${code}</script></body></html>`);
    await page.waitForSelector('[data-hem="top"]');
    await page.waitForTimeout(400);
    const walk = await page.evaluate(async () => {
      const wait = () => new Promise((go) => { setTimeout(go, 90); });
      const scroller = document.scrollingElement!;
      const crown = document.querySelector('[data-hem="top"]') as HTMLElement;
      const out: { y: number; hem: number }[] = [];
      for (const y of [0, 16, 34, 52, 200]) {
        scroller.scrollTo(0, y);
        await wait();
        /* ⚠️ READ OFF THE CROWN, WHERE THE HEM ITSELF READS IT. The value lives
           on the page and inherits down; reading the document root is reading
           the global this deliberately stopped being. */
        out.push({ y, hem: Number(getComputedStyle(crown)
          .getPropertyValue("--hem-top").trim() || "0") });
      }
      return out;
    });
    await page.close();

    expect(walk[0]!.hem, "the head is hemmed with nothing behind it").toBe(0);
    expect(walk.at(-1)!.hem, "the head never reaches full strength").toBe(1);
    /* ⚠️ Strictly between, at every step inside the veil's own depth — and
       rising, because a ramp that is not monotonic is a wobble. */
    const middle = walk.slice(1, -1);
    expect(middle.filter((s) => s.hem <= 0 || s.hem >= 1).map((s) => `${s.y}→${s.hem}`),
      "the hem is fully on or fully off part-way through its own ramp, which is a "
      + "switch wearing a gradient's name").toEqual([]);
    expect(middle.map((s) => s.hem), "the ramp does not rise with the scroll")
      .toEqual([...middle.map((s) => s.hem)].sort((a, b) => a - b));
  }, 90_000);

  /* ⚠️ AND AT A DESK TOO, because the ground is sized in viewport units and a
     layer that lights a phone can be a stripe on a monitor. */
  it("still lights the page at a desk", async () => {
    const world = await worldOf(browser, { code, route: "/" }, css, DESK);
    expect(world.named).toBe(true);
    expect(world.visible, "no light at a desk width").toBeGreaterThan(0.02);
  }, 90_000);
});
