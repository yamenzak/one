/**
 * WHAT A SCREEN ACTUALLY MEASURES, IN A BROWSER.
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
 * is what the browser gets.
 *
 * ⚠️ AND IT IS A `.tsx` RATHER THAN A `.mjs` BECAUSE IT COMPOSES REAL
 * COMPONENTS. A specimen assembled out of hand-written HTML would measure the
 * harness's idea of a card. What is under test is `Group`, `Section`, `Screen`
 * and `Stack` as a screen actually uses them.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

const HERE = dirname(fileURLToPath(import.meta.url));
const SPA = join(HERE, "..", "..", "one-space", "dist", "assets");

/**
 * ⚠️ THE PHONE, BECAUSE THAT IS WHERE THE COMPLAINTS COME FROM. Every screenshot
 * that has ever been sent about spacing in this product was taken on a phone, and
 * a rhythm that reads on a desktop can be two blocks touching at 390.
 */
export const PHONE = { width: 390, height: 844, deviceScaleFactor: 1 } as const;

/** ⚠️ Absent is a build that has not run — a harness measuring nothing must say so. */
export const stylesheet = (): string => {
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
 */
export const pageFor = (markup: string, css: string): string =>
  `<!doctype html><html data-theme="dark"><head><meta charset="utf-8">`
  + `<style>${css}</style>`
  + `<style>html,body{margin:0;padding:0}</style>`
  + `</head><body>${markup}</body></html>`;

export const html = (node: ReactNode): string => renderToStaticMarkup(node);
