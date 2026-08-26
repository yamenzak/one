/**
 * ONE SCREEN, THE SAME SCREEN, UNDER EVERY GROUND WE ARE CHOOSING BETWEEN.
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
