/**
 * THE ONE CONTROL A CONFIRMATION CARRIES, IN A BROWSER.
 *
 * ⚠️ A TOAST DOES NOT EXIST UNTIL SOMETHING CALLS FOR IT, so nothing rendered to
 * a string can see this. `notice.ok` puts a row on a queue and the host draws it
 * through a portal — the first frame of a static render is an empty host, and
 * every assertion about the button would pass over nothing at all.
 *
 * ⚠️ AND THE CLAIM IS A SEAM INTO A LIBRARY, WHICH IS THE OTHER HALF OF WHY IT
 * IS HERE. That `actionProps` renders a pressable that calls back is HeroUI's
 * behaviour, not ours; it was taken from a type definition, and a type
 * definition says a prop is accepted rather than that anything is drawn. The
 * press is read back from the page, so a version that renders the label as inert
 * text fails here instead of shipping as a button that does nothing.
 *
 * ⚠️ THE OTHER TEST IS THE ABSENCE. A way back offered on every confirmation
 * would be a control under every save on every screen — so a plain `notice.ok`
 * has to draw one sentence and no button, and that is asserted rather than
 * assumed.
 */

import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MOUNT, harness } from "./opening.harness.js";
import { PHONE, stylesheet } from "../src/measure/index.js";

let browser: Browser;
let css: string;
let code: string;
/** ⚠️ Built in `beforeAll` for the reason `confirm.seen` records: vite is slower
    than an ordinary test timeout, and a test that fails only under load is one
    everybody learns to re-run. */
beforeAll(async () => {
  css = stylesheet();
  [browser, code] = await Promise.all([chromium.launch(), harness(MOUNT.notice)]);
}, 120_000);
afterAll(async () => { await browser?.close(); });

const board = async () => {
  const p = await browser.newPage({ viewport: { width: PHONE.width, height: PHONE.height } });
  await p.setContent(
    `<!doctype html><html data-theme="dark"><head><meta charset="utf-8">`
    + `<style>${css}</style><style>html,body{margin:0}</style></head><body>`
    + `<div id="root"></div><script>${code}</script></body></html>`);
  return p;
};

describe("a confirmation that can be taken back", () => {
  it("draws the sentence and one control beside it", async () => {
    const p = await board();
    try {
      await p.getByRole("button", { name: "Take it" }).click();
      await p.waitForSelector("[data-slot='toast']");
      expect(await p.getByText("Took 40 from A3 — flammables").count()).toBe(1);
      /* ⚠️ BY ROLE, WHICH IS HALF THE ASSERTION — a label drawn as a span is not
         a button, and the offer has to be reachable by a thumb and a keyboard. */
      expect(await p.getByRole("button", { name: "Undo" }).count()).toBe(1);
    } finally { await p.close(); }
  });

  /*
    ⚠️ AND IT SITS AT THE TRAILING EDGE, BESIDE THE SENTENCE RATHER THAN UNDER
    IT. HeroUI's toast content is a flex COLUMN with `align-items: flex-start`,
    so the way back landed below the words with the whole right half of the row
    empty and the toast half again as tall as it needed to be — and `self-end`
    on the button does nothing against that. `NOTICE_CSS` is the fix and this is
    the only thing that can check it: what is asserted is where the boxes
    LANDED, never a class name, because reading back a class is reading back what
    the component was told.
  */
  it("puts the way back at the trailing edge, on the sentence's own line", async () => {
    const p = await board();
    try {
      await p.getByRole("button", { name: "Take it" }).click();
      await p.waitForSelector("[data-slot='toast']");
      const box = await p.evaluate(() => {
        const at = (s: string) => {
          const el = document.querySelector(s);
          return el ? el.getBoundingClientRect() : null;
        };
        const said = at(".toast__title"); const act = at(".toast__action");
        const whole = at("[data-slot='toast']");
        return said && act && whole
          ? { gap: Math.round(whole.right - act.right),
              /* ⚠️ ROWS OVERLAP VERTICALLY OR THEY ARE TWO ROWS. Comparing tops
                 alone would pass for a control one pixel lower and stacked. */
              beside: act.top < said.bottom && said.top < act.bottom,
              after: Math.round(act.left - said.right) }
          : null;
      });
      expect(box, "the toast drew no title or no action").not.toBeNull();
      expect(box!.beside, "the way back is on its own line under the sentence").toBe(true);
      /* ⚠️ AFTER the sentence, not over it. A negative number is a control
         overlapping the words it belongs to. */
      expect(box!.after, "the control is not after the sentence").toBeGreaterThan(0);
      /* ⚠️ AND NEAR THE EDGE — the close button and the toast's own padding sit
         to its right, so this is "trailing" rather than "flush". Loose on
         purpose: pinning the exact number would fail on a padding change that
         is not this rule. */
      expect(box!.gap, `the control is ${box!.gap}px from the edge`).toBeLessThan(72);
    } finally { await p.close(); }
  });

  /*
    ⚠️ AND A SENTENCE LONGER THAN THE ROW DOES NOT PUSH THE CONTROL OUT OF IT.
    Turning a box into a row is the kind of change that looks right on the one
    string somebody tested it with and takes the control off the trailing edge
    on a real one — a movement names a product AND a shelf and runs past the
    width easily. The sizing that holds it is HeroUI's own, which is exactly why
    this is asserted rather than assumed: `NOTICE_CSS` says nothing about it, so
    nothing here would notice the day the library stopped.
  */
  it("keeps the control inside the toast when the sentence is long", async () => {
    const p = await board();
    try {
      await p.getByRole("button", { name: "Take a lot" }).click();
      await p.waitForSelector("[data-slot='toast']");
      const box = await p.evaluate(() => {
        const at = (s: string) => {
          const el = document.querySelector(s);
          return el ? el.getBoundingClientRect() : null;
        };
        const act = at(".toast__action"); const whole = at("[data-slot='toast']");
        const said = at(".toast__title");
        return act && whole && said
          ? { inside: act.right <= whole.right, wide: Math.round(act.width),
              /* ⚠️ HOW FAR THE CONTROL'S MIDDLE IS FROM THE SENTENCE'S. A
                 sentence this long wraps, so the two are only level if the row
                 centres them — left alone the control sits against the FIRST
                 line and reads as belonging to it. */
              off: Math.round(Math.abs(
                (act.top + act.bottom) / 2 - (said.top + said.bottom) / 2)),
              lines: Math.round(said.height) }
          : null;
      });
      expect(box, "the long toast drew no action").not.toBeNull();
      expect(box!.inside, "the control was pushed past the toast's own edge").toBe(true);
      /* ⚠️ AND IT IS STILL A CONTROL. Squeezed to a sliver it is inside the
         toast and unpressable, which the assertion above would call a pass. */
      expect(box!.wide, `the control was squeezed to ${box!.wide}px`).toBeGreaterThan(48);
      /* ⚠️ AND THE FIXTURE ACTUALLY WRAPPED. Centring is only a claim about a
         sentence taller than one line, so a fixture that fitted on one would
         pass this whatever the row does. */
      expect(box!.lines, "the long sentence did not wrap, so nothing is centred here")
        .toBeGreaterThan(40);
      expect(box!.off, `the control's middle is ${box!.off}px off the sentence's`)
        .toBeLessThan(6);
    } finally { await p.close(); }
  });

  /* ⚠️ THE PRESS, READ BACK OFF THE PAGE. A label rendered as text would satisfy
     every assertion above and do nothing here, which is the whole failure this
     file exists to catch. */
  it("runs the way back when it is pressed", async () => {
    const p = await board();
    try {
      await p.getByRole("button", { name: "Take it" }).click();
      await p.getByRole("button", { name: "Undo" }).click();
      await p.waitForFunction(() => document.title === "undone");
      expect(await p.title()).toBe("undone");
    } finally { await p.close(); }
  });

  it("draws no control on a confirmation with no way back", async () => {
    const p = await board();
    try {
      await p.getByRole("button", { name: "Correct it" }).click();
      await p.waitForSelector("[data-slot='toast']");
      expect(await p.getByText("Corrected.").count()).toBe(1);
      expect(await p.getByRole("button", { name: "Undo" }).count()).toBe(0);
    } finally { await p.close(); }
  });
});
