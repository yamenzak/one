/**
 * DOES EVERY DESTINATION ACTUALLY SIT ON THE PLATE — asked as geometry, because
 * nothing that reads a stylesheet can answer it.
 *
 * ⚠️ THE FAULT THIS EXISTS FOR SHIPPED, ON EVERY DESKTOP SCREEN IN THE PRODUCT,
 * AND EVERY CHECK IN THE REPOSITORY WAS GREEN. `[data-island]` is
 * `border-radius: 9999px` — correct for the bar at the foot of a phone, which is
 * 360 × 64 — and the desktop rail borrows that plate deliberately, so the same
 * declaration made a 192 × 188 column into a CIRCLE. The first and last of five
 * destinations sat half on the plate and half on the page, in the plate's own
 * ink, on a cream ground. Measured: the rail's region was 5.2× darker than the
 * page beside it.
 *
 * ⚠️ AND THE CONTRAST READING COULD NOT SEE IT, WHICH IS THE POINT. `contrastOf`
 * composites an ink against the computed BACKGROUND of what it sits in — and the
 * label sits in a transparent button inside a plate it has fallen off, so the
 * number it produces is the label against the plate it is no longer on. A colour
 * check that cannot see geometry answers a question about a screen nobody is
 * looking at.
 *
 * ⚠️ SO THE ASSERTION IS THE ROUNDED RECTANGLE ITSELF. A browser clamps a radius
 * to half the shorter side; whether a corner of a child falls outside the curve
 * is arithmetic over two boxes and one number, it does not care WHY the plate is
 * shaped as it is, and it holds for any plate, any radius and any number of
 * destinations.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DESK, mounted, stylesheet } from "../src/measure/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));

let browser: Browser;
let css: string;
let code: string;
beforeAll(async () => {
  css = stylesheet();
  code = await mounted(join(HERE, "rail.mount.tsx"));
  browser = await chromium.launch();
}, 180_000);
afterAll(async () => { await browser?.close(); });

interface Plate {
  readonly box: readonly [number, number, number, number];
  readonly radius: number;
  readonly items: readonly {
    readonly text: string;
    readonly box: readonly [number, number, number, number];
  }[];
}

const rail = async (theme: "dark" | "light"): Promise<Plate> => {
  const page = await browser.newPage({ viewport: DESK });
  try {
    await page.setContent(`<!doctype html><html data-theme="${theme}"><head><style>${css}`
      + `</style></head><body><div id="root"></div>`
      + `<script type="module">${code}</script></body></html>`, { waitUntil: "load" });
    await page.waitForSelector('nav[aria-label="Sections"] [data-island]');
    await page.waitForTimeout(400);
    return await page.evaluate(() => {
      const plate = document.querySelector('nav[aria-label="Sections"] [data-island]')!;
      const b = plate.getBoundingClientRect();
      const of = (el: Element) => {
        const r = el.getBoundingClientRect();
        return [r.left, r.top, r.right, r.bottom] as [number, number, number, number];
      };
      return {
        box: of(plate),
        /* ⚠️ THE RESOLVED NUMBER, NOT THE DECLARED ONE. `9999px` is what the rule
           says and half the shorter side is what the browser draws; only one of
           the two is the shape on the screen. */
        radius: Math.min(
          parseFloat(getComputedStyle(plate).borderTopLeftRadius) || 0,
          b.width / 2, b.height / 2,
        ),
        items: Array.from(plate.querySelectorAll("button"))
          .map((el) => ({ text: (el.textContent ?? "").trim(), box: of(el) })),
      };
    });
  } finally {
    await page.close();
  }
};

/**
 * ⚠️ THE CORNER IS THE ONLY PART THAT CAN BE OUTSIDE, so that is what is asked.
 * Inside the straight edges a rounded rectangle IS its box; the curve only takes
 * away the four corner squares, and a point in one of them is inside the shape
 * only while it is within `r` of that corner's centre.
 */
const outside = (
  plate: Plate["box"], r: number, [x0, y0, x1, y1]: Plate["items"][number]["box"],
): boolean => {
  const [l, t, right, b] = plate;
  if (x0 < l - 0.5 || y0 < t - 0.5 || x1 > right + 0.5 || y1 > b + 0.5) return true;
  const corners = [
    [l + r, t + r, x0, y0], [right - r, t + r, x1, y0],
    [l + r, b - r, x0, y1], [right - r, b - r, x1, y1],
  ] as const;
  return corners.some(([cx, cy, px, py]) => {
    /* ⚠️ ONLY WHERE THE POINT IS ACTUALLY IN THE CORNER SQUARE. A point level
       with the middle of the plate is past `cx` on one axis and inside on the
       other, and measuring its distance to a corner centre would report every
       middle row as outside a plate it is comfortably within. */
    const dx = px < cx && px < l + r ? cx - px : px > cx && px > right - r ? px - cx : 0;
    const dy = py < cy && py < t + r ? cy - py : py > cy && py > b - r ? py - cy : 0;
    return dx > 0 && dy > 0 && Math.hypot(dx, dy) > r + 0.5;
  });
};

describe("the rail's plate holds everything on it", () => {
  for (const theme of ["dark", "light"] as const) {
    it(`keeps every destination inside the plate, in ${theme}`, async () => {
      const seen = await rail(theme);
      expect(seen.items.length, "the fixture drew no destinations").toBe(5);
      const off = seen.items.filter((one) => outside(seen.box, seen.radius, one.box));
      expect(
        off.map((one) => one.text),
        `a ${Math.round(seen.box[2] - seen.box[0])} × ${Math.round(seen.box[3] - seen.box[1])} `
        + `plate at radius ${Math.round(seen.radius)} leaves ${off.length} of `
        + `${seen.items.length} destination(s) off it`,
      ).toEqual([]);
    }, 120_000);
  }

  /*
    ⚠️ AND THE RADIUS IS NOT A PILL, SAID SEPARATELY. The check above passes on a
    plate that is a circle IF nothing happens to reach its corners — five items
    fall off, four might not, and a rule that only bites at one destination count
    is one somebody removes a screen to satisfy. A plate as round as it is tall
    is a capsule standing on end, which is never what a column of rows is.
  */
  it("does not draw a column as a capsule", async () => {
    const seen = await rail("light");
    const shorter = Math.min(seen.box[2] - seen.box[0], seen.box[3] - seen.box[1]);
    expect(
      seen.radius,
      `the plate is ${Math.round(seen.box[2] - seen.box[0])} wide and `
      + `${Math.round(seen.box[3] - seen.box[1])} tall, and a radius of `
      + `${Math.round(seen.radius)} makes it a capsule rather than a plate`,
    ).toBeLessThan(shorter / 2 - 1);
  }, 120_000);
});
