/**
 * THE GROUND IS PAINTED; THE FURNITURE IS LIT BY IT.
 *
 * A component never names a colour and never receives one. It asks for a step
 * from its parent, and the step is computed here.
 *
 * ⚠️ NO STEP IS A CONSTANT, which is what makes a wild accent unable to break
 * the ladder. Absolute surface tokens work for the palette they were tuned
 * against: give the same tokens a saturated brand ground and the card is a
 * different distance from the page than it was designed to be, in a direction
 * nobody chose.
 */

import { bestForeground, contrast, oklchToRgb, rgbToOklch, type Oklch, type Rgb } from "./colour.js";

export type Theme = "light" | "dark";

/** How far apart two surfaces must look. Perceptual, so it holds at every hue. */
const STEP_L = 0.045;
/** How much of the ground's colour the furniture inherits. */
const TINT = 0.35;

/** The floors. ⚠️ Not aspirations: the sweep in `test/` proves every one holds. */
export const FLOOR = { text: 4.5, largeText: 3, nonText: 3 } as const;

export interface Ground {
  readonly theme: Theme;
  /** The canvas. Every surface is a computed distance from here. */
  readonly canvas: Oklch;
  /** The tenant's accent, as given. Re-lit per ground, never recomputed. */
  readonly accent: Oklch;
}

/**
 * One step away from a surface.
 *
 * ⚠️ THE DIRECTION IS WHICHEVER HAS HEADROOM, and that is not a detail. Elevation
 * as "always lighter" saturates: a near-white light-mode page reaches white at
 * the first step and every surface after it is the same colour, so an input
 * inside a card inside a sheet is one flat rectangle. Choosing the direction per
 * step means the ladder never runs out at either end of either theme.
 *
 * ⚠️ AND IT CARRIES THE GROUND'S HUE. A card on a branded ground is a tinted
 * card without anybody choosing one — which is the whole reason a per-page
 * palette is unnecessary.
 */
export function step(from: Oklch, ground: Oklch, n = 1): Oklch {
  let current = from;
  for (let i = 0; i < n; i++) {
    const up = 1 - current.l;
    const down = current.l;
    const delta = up >= down ? STEP_L : -STEP_L;
    current = {
      l: Math.min(0.995, Math.max(0.02, current.l + delta)),
      c: Math.min(ground.c * TINT, 0.06),
      h: ground.h,
    };
  }
  return current;
}

/** The surface ladder for a ground: canvas, then as many steps as asked for. */
export function surfaces(ground: Ground, depth = 3): readonly Oklch[] {
  const out: Oklch[] = [ground.canvas];
  for (let i = 1; i <= depth; i++) out.push(step(out[i - 1]!, ground.canvas));
  return out;
}

/**
 * ⚠️ THE ACCENT IS RE-LIT AGAINST ITS GROUND. IT IS NEVER RECOMPUTED.
 *
 * The tenant's HUE is kept exactly; lightness and chroma move until the colour
 * clears its floor on this exact surface. So the brand is recognisably itself on
 * every surface in the product and legible on all of them.
 *
 * The tempting alternative is to let a screen pick a new primary that happens to
 * contrast. That produces a product whose brand colour is a different colour on
 * every screen, where the button you press is a different button each time, and
 * where the tenant who chose their accent never sees it.
 */
export function accentOn(accent: Oklch, surface: Oklch, floor: number = FLOOR.nonText): Oklch {
  const bg = oklchToRgb(surface);
  /*
    ⚠️ TWO CONSTRAINTS, NOT ONE, and the second is the one that is easy to miss.
    An accent must be visible AGAINST its surface, and it must be able to carry
    INK when it is used as a fill. A mid-lightness saturated colour satisfies the
    first and fails the second: near-white and near-dark are both borderline on
    it, so a filled button is legible in neither theme.

    Satisfying only the first is what an exhaustive sweep catches and a
    hand-picked palette does not — it failed for 74 of 144 hue-and-theme pairs,
    all of them in the band where neither ink works.
  */
  const fits = (candidate: Oklch): boolean =>
    contrast(oklchToRgb(candidate), bg) >= floor && bestForeground(oklchToRgb(candidate)).ratio >= FLOOR.text;
  if (fits(accent)) return accent;

  /*
    Search BOTH directions and keep whichever reaches the floor with the smaller
    move. Always darkening would turn a brand into near-black on a dark ground;
    always lightening would wash it out on a light one.
  */
  let best: Oklch | null = null;
  let bestDistance = Infinity;
  for (const direction of [-1, 1]) {
    for (let delta = 0.02; delta <= 0.9; delta += 0.02) {
      const l = accent.l + direction * delta;
      if (l <= 0.05 || l >= 0.99) break;
      const candidate = { ...accent, l };
      if (!fits(candidate)) continue;
      if (delta < bestDistance) { best = candidate; bestDistance = delta; }
      break;
    }
  }
  /*
    ⚠️ CHROMA IS THE LAST THING GIVEN UP, AND ONLY IF LIGHTNESS COULD NOT REACH
    the floor at any lightness — which happens for a very saturated hue against a
    surface of similar lightness. A duller brand is a compromise; an illegible
    one is a defect.
  */
  if (best) return best;
  for (let c = accent.c; c >= 0; c -= 0.01) {
    for (let l = 0.2; l <= 0.92; l += 0.02) {
      const candidate = { l, c, h: accent.h };
      if (fits(candidate)) return candidate;
    }
  }
  return { l: surface.l > 0.5 ? 0.2 : 0.9, c: 0, h: accent.h };
}

/** The ink for any surface, measured. There is no other way to obtain one. */
export function inkOn(surface: Oklch): { readonly ink: Rgb; readonly ratio: number } {
  return bestForeground(oklchToRgb(surface));
}

/**
 * ⚠️ A SEMANTIC SIGNAL MUST DIFFER FROM ITS CONTEXT, NOT MERELY BE READABLE.
 *
 * Green success on a green ambience can clear every contrast floor and still
 * fail completely, because a signal's job is to be distinguishable from what
 * surrounds it. Contrast checking alone ships this bug.
 *
 * So collision is DETECTED — hue distance at comparable chroma — and the
 * renderer answers by demoting the tone to an edge and an icon on a neutral
 * surface. An author never writes a conditional about it and never learns the
 * threshold.
 */
export function collides(tone: Oklch, ground: Oklch): boolean {
  /*
    The signed shortest way round the wheel, then its magnitude — so identical
    hues are 0 apart and opposite ones are 180. Getting the direction of this
    comparison wrong reads as a working check that fires on complementary
    colours, which are the pairs least likely to be confused.
  */
  const apart = Math.abs(((tone.h - ground.h + 540) % 360) - 180);
  // A ground with almost no chroma cannot collide with anything: it is grey.
  return apart < 30 && ground.c > 0.015;
}

/** Where a semantic sits, given its ground. One decision, made once. */
export type SemanticForm = "tone" | "contained";
export const semanticForm = (tone: Oklch, ground: Oklch): SemanticForm =>
  collides(tone, ground) ? "contained" : "tone";

export { rgbToOklch };
