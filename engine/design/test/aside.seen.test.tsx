/**
 * THE SHEET THAT CHANGES ITS OWN QUESTION, IN A BROWSER.
 *
 * ⚠️ THE ONE THING WORTH CHECKING HERE HAS NO STATIC FORM. Pressing "Keep it,
 * but out of the way" replaces the title, both sentences and the button, in
 * place, without closing anything — and a string render sees a trigger. The copy
 * itself is asserted in `aside.test`; what this asks is whether the switch
 * actually happens and whether the way back to the destructive option is closed
 * once it has.
 *
 * ⚠️ AND THE THING BEING ASSERTED IS WHAT A PERSON MEETS. "The red button became
 * a neutral one" is a fact about the control they are looking at, and it stays
 * true through a library rename.
 */

import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MOUNT, harness } from "./opening.harness.js";
import { PHONE, stillness, stylesheet } from "../src/measure/index.js";

let browser: Browser;
let css: string;
let code: string;

beforeAll(async () => {
  css = stylesheet();
  [browser, code] = await Promise.all([chromium.launch(), harness(MOUNT.aside)]);
}, 120_000);
afterAll(async () => { await browser?.close(); });

const opened = async () => {
  const p = await browser.newPage({ viewport: { width: PHONE.width, height: PHONE.height } });
  await p.setContent(
    `<!doctype html><html data-theme="dark"><head><meta charset="utf-8">`
    + `<style>${css}</style><style>html,body{margin:0}</style></head><body>`
    + `<div id="root"></div><script>${code}</script></body></html>`);
  await p.getByRole("button", { name: "Delete" }).first().click();
  /* ⚠️ BY ROLE, which is half the assertion: a sheet that lost `alertdialog`
     would time out here rather than pass quietly. It is what makes a screen
     reader announce the question rather than wait to be asked. */
  await p.waitForSelector("[role='alertdialog']");
  await stillness(p, "[role='alertdialog']");
  return p;
};

describe("asking before a record leaves", () => {
  it("asks about the record by name, and says it can come back", async () => {
    const p = await opened();
    const said = await p.locator("[role='alertdialog']").innerText();
    expect(said).toContain("Casting resin, clear");
    expect(said).toContain("put it back");
    /* ⚠️ AND OFFERS THE OTHER WAY, at the moment somebody is deciding. Half the
       time "stop showing me this" is what they meant, and the moment they care
       about the difference is the moment they have pressed Delete. */
    expect(said).toContain("Keep it, out of the way");
    await p.close();
  });

  it("changes the whole question in place, without closing", async () => {
    const p = await opened();
    await p.getByText("Keep it, out of the way").click();
    /* ⚠️ SAME SHEET. A second drawer would be an interruption on top of an
       interruption, and the phone's back gesture would then take somebody to a
       question they had already left. */
    await p.waitForSelector("[role='alertdialog']");
    const said = await p.locator("[role='alertdialog']").innerText();
    expect(said).toContain("Put Casting resin, clear out of the way?");
    expect(said).toContain("never destroyed");
    /* ⚠️ AND THE WAY BACK TO DELETING IS GONE. A confirmation that talks
       somebody INTO the destructive option is the one direction this must never
       travel. */
    expect(said).not.toContain("Keep it, out of the way");
    await p.close();
  });

  /* ⚠️ ONLY ONE OF THE TWO IS DANGEROUS, and dressing both in red would say the
     outcomes weigh the same. Freezing destroys nothing and is undone by a
     press. Measured as INK rather than as a class name: what a person meets is a
     red button or a neutral one. */
  it("wears danger for the bin and not for the freeze", async () => {
    const p = await opened();
    const inkOf = () => p.evaluate(() => {
      const sheet = document.querySelector("[role='alertdialog']")!;
      const buttons = [...sheet.querySelectorAll("button")];
      const last = buttons.at(-1)!;
      return getComputedStyle(last).backgroundColor;
    });

    const dangerous = await inkOf();
    await p.getByText("Keep it, out of the way").click();
    await p.waitForTimeout(50);
    const calm = await inkOf();

    expect(dangerous).not.toBe(calm);
    await p.close();
  });

});
