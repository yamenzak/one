/**
 * ONE SCREEN, THE SAME SCREEN, UNDER EVERY GROUND AND EVERY WORLD WE ARE
 * CHOOSING BETWEEN.
 *
 * ⚠️ A PALETTE IS ARGUED ABOUT IN WORDS AND DECIDED IN PIXELS. "Too dark" and
 * "not enough contrast" are both true of a ladder that measures evenly in oklch,
 * because oklch lightness compresses hard at the bottom of its range: the step
 * from 0.055 to 0.135 that separates the page from a card is EIGHT sRGB values,
 * and the same step through the middle is twenty-five. The ladder was even, the
 * screen was one black rectangle, and no number anybody was looking at said so.
 *
 * ⚠️ IT OVERRIDES RATHER THAN EDITS, WHICH IS WHY IT IS A HARNESS AND NOT A
 * BRANCH. Each look is a block of `--tier-*` values appended after the shipped
 * stylesheet — same specificity, later wins — so comparing nine grounds costs
 * nine screenshots rather than nine commits, and whichever is chosen is written
 * into `tokens/ground.ts` afterwards as the only copy of it.
 *
 * ⚠️ A WORLD IS NOT OVERRIDDEN THE SAME WAY, AND THAT IS WHY THERE ARE TWO
 * SWEEPS. A ground ladder is custom properties in a stylesheet, so a later block
 * at the same specificity wins; a sky is React state built from the manifest and
 * written onto the element as inline properties, which no stylesheet can reach.
 * The seam is `Live.sky` — the same channel the route already travels down —
 * and the board takes it as a prop.
 *
 * ⚠️ THE SKIES ARE SWEPT ON ONE GROUND, ON PURPOSE. Comparing nine worlds on
 * nine ladders answers neither question: every difference has two causes and the
 * eye attributes it to whichever it was looking for.
 *
 * ⚠️ IN THE `shots` LANE RATHER THAN THE GATE. It photographs; it asks nothing
 * that has a pass or a fail, and a deploy is not waiting to know what a palette
 * looks like.
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PHONE, mounted, shoot, stylesheet } from "@engine/design/measuring";

/** A ground ladder, as oklch lightnesses, plus how much colour the neutrals carry. */
type Look = {
  readonly id: string;
  readonly theme: "dark" | "light";
  readonly page: number; readonly base: number; readonly raised: number;
  readonly control: number; readonly chroma: number; readonly hue: number;
};

const WARM = { chroma: 0.012, hue: 68 };
const COOL = { chroma: 0.006, hue: 250 };
const FLAT = { chroma: 0, hue: 0 };

const LOOKS: readonly Look[] = [
  /* dark */
  { id: "d1-now", theme: "dark", page: 0.055, base: 0.135, raised: 0.195, control: 0.255, ...WARM },
  { id: "d2-ink", theme: "dark", page: 0.135, base: 0.215, raised: 0.275, control: 0.33, ...WARM },
  { id: "d3-lifted", theme: "dark", page: 0.19, base: 0.265, raised: 0.325, control: 0.38, ...WARM },
  { id: "d4-graphite", theme: "dark", page: 0.225, base: 0.30, raised: 0.36, control: 0.42, ...FLAT },
  { id: "d5-slate", theme: "dark", page: 0.20, base: 0.275, raised: 0.335, control: 0.39, ...COOL },
  /* light */
  { id: "l1-now", theme: "light", page: 0.9702, base: 1.0, raised: 0.94, control: 0.94, ...WARM },
  { id: "l2-paper", theme: "light", page: 0.938, base: 1.0, raised: 0.90, control: 0.955, ...WARM },
  { id: "l3-linen", theme: "light", page: 0.915, base: 0.995, raised: 0.875, control: 0.945, ...WARM },
  { id: "l4-cool", theme: "light", page: 0.935, base: 1.0, raised: 0.90, control: 0.955, ...COOL },
];

const ok = (l: number, c: number, h: number) => `oklch(${l} ${c} ${h})`;

const over = (k: Look) => {
  const c = k.chroma; const h = k.hue;
  const card = (k.base + k.raised) / 2;
  return `[data-theme="${k.theme}"]{`
    + `--tier-page:${ok(k.page, c, h)};`
    + `--tier-base:${ok(k.base, c, h)};`
    + `--tier-card:${ok(card, c, h)};`
    + `--tier-raised:${ok(k.raised, c, h)};`
    + `--tier-field:${ok(k.control, c, h)};`
    + `--tier-control:${ok(k.control, c, h)};`
    + `}`;
};

const OUT = join(import.meta.dirname, "..", "shots-out", "looks");
const TALL = { width: PHONE.width, height: 1_200 } as const;

let browser: Browser;
let css: string;
let code: string;
beforeAll(async () => {
  css = stylesheet();
  code = await mounted(join(import.meta.dirname, "..", "shots", "mount.tsx"));
  browser = await chromium.launch();
  mkdirSync(OUT, { recursive: true });
}, 180_000);
afterAll(async () => { await browser?.close(); });

describe("looks", () => {
  for (const k of LOOKS) {
    it(k.id, async () => {
      await shoot(browser, { code, route: "/" }, `${css}\n${over(k)}`, TALL, k.theme,
        join(OUT, `${k.id}.png`));
      expect(1).toBe(1);
    }, 90_000);
  }
});

/**
 * ⚠️ THE WORLDS A SCREEN MAY NAME, WHICH IS NOT EVERY FAMILY — see `SKIES`.
 * `space` and `aura` read their two colours out of a generated PICTURE and there
 * is no picture behind a screen, so naming one draws a world with no marks in
 * it. Photographing them would be photographing the absence.
 *
 * ⚠️ AND `plain` IS IN THE SWEEP BECAUSE IT IS THE DEFAULT AND THE CONTROL. What
 * is being asked is whether a world earns its place on this screen at all, and
 * that question has no answer without the picture of it not being there.
 */
const WORLDS = ["plain", "glow", "cloth", "etch", "loops", "blobs", "tint", "neon"] as const;

/** ⚠️ ONE LADDER UNDER ALL OF THEM — see the header. */
const UNDER = LOOKS.find((k) => k.id === "d3-lifted")!;

describe("worlds", () => {
  for (const sky of WORLDS) {
    it(sky, async () => {
      await shoot(browser, { code, route: "/", sky }, `${css}\n${over(UNDER)}`, TALL, "dark",
        join(OUT, `sky-${sky}.png`));
      expect(1).toBe(1);
    }, 90_000);
  }
});
