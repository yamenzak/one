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
