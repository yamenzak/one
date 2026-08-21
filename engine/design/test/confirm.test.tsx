/**
 * THE TWO-STEP, OPENED, IN A BROWSER.
 *
 * ⚠️ ITS SHAPE IS DECIDED AT OPEN TIME, SO A STRING CANNOT SEE IT. Rendered
 * statically a `Confirm` is a trigger and nothing else: the surface, its role,
 * where it comes from and the order of its buttons are all the library's answer
 * to a press. An assertion on the first frame passes every version of this,
 * including the centred dialogue this replaced.
 *
 * ⚠️ AND THE THING BEING ASSERTED IS WHAT A PERSON MEETS, not which component
 * was imported. "It slides up from the bottom" is a measurement — the surface's
 * own box against the viewport's — and it stays true through a library rename.
 */

import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MOUNT, harness } from "./opening.harness.js";
import { PHONE, stylesheet } from "../src/measure/index.js";

let browser: Browser;
let css: string;
/**
 * ⚠️ THE BUNDLE IS BUILT HERE, NOT IN THE FIRST TEST. Vite takes a few seconds,
 * and paid inside a test it is charged against the ordinary five-second timeout
 * — which passed when this file ran alone and timed out the moment the whole
 * suite was running beside it. A test that fails only under load is a test
 * everybody learns to re-run.
 */
let code: string;
beforeAll(async () => {
  css = stylesheet();
  [browser, code] = await Promise.all([chromium.launch(), harness(MOUNT.confirm)]);
}, 120_000);
afterAll(async () => { await browser?.close(); });

const opened = async () => {
  const p = await browser.newPage({ viewport: { width: PHONE.width, height: PHONE.height } });
  await p.setContent(
    `<!doctype html><html data-theme="dark"><head><meta charset="utf-8">`
    + `<style>${css}</style><style>html,body{margin:0}</style></head><body>`
    + `<div id="root"></div><script>${code}</script></body></html>`);
  await p.getByRole("button", { name: "Open it" }).click();
  /* ⚠️ Waited for by ROLE, which is half the assertion: a drawer that lost the
     role would time out here rather than pass quietly. */
  await p.waitForSelector("[role='alertdialog']");
  /* ⚠️ And after it has finished arriving — a sheet measured mid-slide is
     measured somewhere it never rests. */
  await p.waitForTimeout(500);
  return p;
};

describe("confirming something that cannot be undone", () => {
  /*
    ⚠️ IT COMES FROM THE EDGE, LIKE EVERY OTHER INTERRUPTION HERE. It was a box
    in the middle while `Tray` slid up, so the one moment a person has to read
    carefully was the one moment the product moved differently — and on a phone
    that is a control at the top of the reach rather than under the thumb.
  */
  it("arrives as a sheet at the bottom of the screen", async () => {
    const p = await opened();
    try {
      const box = await p.evaluate(() => {
        const r = document.querySelector("[role='alertdialog']")!.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width) };
      });
      /* ⚠️ Its foot is the viewport's foot, and its head is not the viewport's
         head — which is what "a sheet" IS, as geometry rather than a class. */
      expect(box.bottom, "sits on the bottom edge").toBe(PHONE.height);
      expect(box.top, "and does not start at the top").toBeGreaterThan(0);
      expect(box.width, "full width, like the tray").toBe(PHONE.width);
    } finally { await p.close(); }
  });

  /*
    ⚠️ THE ROLE IS THE HALF THAT IS NOT VISIBLE, AND IT IS THE REASON THE OLD
    COMPONENT EXISTED. `alertdialog` is what makes a screen reader announce the
    question on arrival instead of waiting to be asked. Moving to a sheet to gain
    the presentation would have quietly dropped it.
  */
  it("still announces itself as a warning", async () => {
    const p = await opened();
    try {
      expect(await p.locator("[role='alertdialog']").count()).toBe(1);
      /* ⚠️ Labelled by its own heading, or a reader announces an unnamed box. */
      const named = await p.evaluate(() => {
        const el = document.querySelector("[role='alertdialog']")!;
        const by = el.getAttribute("aria-labelledby");
        return by ? (document.getElementById(by)?.textContent ?? "") : el.getAttribute("aria-label");
      });
      expect(named).toContain("Delete everything?");
    } finally { await p.close(); }
  });

  /*
    ⚠️ THE DESTRUCTIVE BUTTON IS ARRIVED AT, NOT LANDED ON. The footer lays its
    actions in a row, so the way out is read first and the act last — and this
    asserts the ORDER rather than the layout, which is the library's to choose.
  */
  it("puts the way out before the act, not after it", async () => {
    const p = await opened();
    try {
      const seen = await p.evaluate(() => {
        const foot = document.querySelector("[data-slot='drawer-footer']")
          ?? document.querySelector("[role='alertdialog']")!;
        return [...foot.querySelectorAll("button")].map((b) => ({
          text: (b.textContent ?? "").trim(),
          left: Math.round(b.getBoundingClientRect().left),
        }));
      });
      const act = seen.find((b) => b.text === "Delete");
      const out = seen.find((b) => b.text === "Cancel");
      expect(act, "the act").toBeTruthy();
      expect(out, "the way out").toBeTruthy();
      expect(out!.left, "cancel is read before delete").toBeLessThan(act!.left);
    } finally { await p.close(); }
  });

  /* ⚠️ AND IT STILL DOES THE THING. A two-step that looks right and never fires
     is the failure this whole file would otherwise miss. */
  it("runs the act when the act is pressed", async () => {
    const p = await opened();
    try {
      await p.getByRole("button", { name: "Delete" }).click();
      await p.waitForFunction(() => document.title === "did", undefined, { timeout: 3000 });
      expect(await p.title()).toBe("did");
    } finally { await p.close(); }
  });
});
