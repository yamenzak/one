/**
 * WHEN A FLOW SAYS WHAT IS MISSING — asked by pressing the button, because the
 * whole question is about what a press does.
 *
 * ⚠️ THE FAULT: A FLOW OPENED BY TELLING SOMEBODY OFF. Every story whose first
 * step is a required field drew "Name is needed before this can be saved", with
 * the alert mark, under a control nobody had touched, beside a Next that was
 * already dim. The sentence is correct and the timing was not — and the static
 * test that covered it asserted exactly the wrong half, because "is the sentence
 * there" is answerable without a browser and "is it there YET" is not.
 *
 * ⚠️ AND A DIM CONTROL THAT DOES NOT SAY WHY IS THE OTHER HALF OF IT. The dock's
 * own header argues against offer-and-refuse; a Next that is present, disabled
 * and silent is that shape with the sentence taken away. So the press answers:
 * it says what is missing and stays put, which is a press that did something.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PHONE, mounted, stylesheet } from "../src/measure/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));

let browser: Browser;
let css: string;
let code: string;
beforeAll(async () => {
  css = stylesheet();
  code = await mounted(join(HERE, "asking.mount.tsx"));
  browser = await chromium.launch();
}, 180_000);
afterAll(async () => { await browser?.close(); });

const MISSING = "Name is needed before this can be saved";

const flow = async (): Promise<Page> => {
  const page = await browser.newPage({ viewport: PHONE });
  await page.setContent(`<!doctype html><html data-theme="dark"><head><style>${css}`
    + `</style></head><body><div id="root"></div>`
    + `<script type="module">${code}</script></body></html>`, { waitUntil: "load" });
  await page.waitForSelector("text=What is it called?");
  return page;
};

/* ⚠️ THE DOCK'S FORWARD PRESS, FOUND BY ITS WORD. There are two controls at the
   foot and only one of them goes on; matching the button by its label is what
   the person does. */
const next = (page: Page) => page.getByRole("button", { name: "Next", exact: true });

describe("a flow asks before it complains", () => {
  it("says nothing about a question nobody has answered yet", async () => {
    const page = await flow();
    try {
      expect(await page.getByText(MISSING).count()).toBe(0);
      /* ⚠️ AND THE WAY FORWARD IS OFFERED, because it is what turns the silence
         into an answer rather than a second thing withheld. */
      expect(await next(page).isDisabled()).toBe(false);
    } finally { await page.close(); }
  }, 120_000);

  it("says what is missing when somebody tries to go on, and stays put", async () => {
    const page = await flow();
    try {
      await next(page).click();
      await page.waitForSelector(`text=${MISSING}`);
      /* ⚠️ STAYS PUT, WHICH IS THE HALF A SENTENCE ALONE DOES NOT PROVE. A flow
         that both complained and advanced would pass every assertion about the
         words and leave somebody two screens past the field they have to fix. */
      expect(await page.getByText("What is it called?").count()).toBe(1);
      expect(await page.getByText("Who makes it?").count()).toBe(0);
    } finally { await page.close(); }
  }, 120_000);

  it("goes on once the question is answered", async () => {
    const page = await flow();
    try {
      await next(page).click();
      await page.waitForSelector(`text=${MISSING}`);
      await page.getByLabel("Name").fill("Casting resin");
      /* ⚠️ AND THE SENTENCE GOES WITH THE ANSWER, rather than standing over a
         box somebody has just filled in. */
      expect(await page.getByText(MISSING).count()).toBe(0);
      await next(page).click();
      await page.waitForSelector("text=Who makes it?");
    } finally { await page.close(); }
  }, 120_000);
});
