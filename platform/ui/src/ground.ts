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

/** Nothing reaches pure white: an absolute ceiling has nowhere left to go. */
const CEIL = 0.999;
/**
 * ⚠️ IN LIGHT, A STEP SPENDS A FRACTION OF WHAT IS LEFT rather than a fixed
 * amount. See `step` — the fraction is high on purpose, so the page-to-card step
 * gets most of the room.
 */
const LIGHT_REACH = 0.83;

/**
 * One step away from a surface, ALWAYS TOWARD THE LIGHT.
 *
 * ⚠️ ELEVATION IS TOWARD THE LIGHT IN BOTH THEMES, and the first version of this
 * was not. It stepped in whichever direction had more headroom, which on a
 * near-white page means DOWN — so a light theme's cards came out grey on a white
 * page, which reads as dusty rather than as lit. That is the single most common
 * way a light theme looks cheap, and it was the rule rather than an accident.
 *
 * ⚠️ THE TWO THEMES USE DIFFERENT ARITHMETIC BECAUSE THE PHYSICS DIFFER. A dark
 * ground has unlimited room above it, so a step is a fixed perceptual distance.
 * A light ground has almost none, so a step spends a FRACTION of what remains —
 * which puts most of the room into the page-to-card step, the one that carries
 * the design, and leaves the deeper levels to be separated by ELEVATION. That is
 * not a compromise: it is how a bright room works. Everything is already lit, so
 * things are told apart by the shadows they cast, which is exactly why
 * `--elevation` is a shadow in light and nothing at all in dark.
 *
 * ⚠️ AND IT CARRIES THE GROUND'S HUE. A card on a branded ground is a tinted
 * card without anybody choosing one — which is the whole reason a per-page
 * palette is unnecessary.
 */
export function step(from: Oklch, ground: Oklch, n = 1): Oklch {
  let current = from;
  for (let i = 0; i < n; i++) {
    /* Which theme this is, read off the ground rather than passed in. */
    const l = ground.l > 0.5 ? current.l + (CEIL - current.l) * LIGHT_REACH : current.l + STEP_L;
    current = {
      l: Math.min(CEIL, Math.max(0.02, l)),
      c: Math.min(ground.c * TINT, 0.06),
      h: ground.h,
    };
  }
  return current;
}

/**
 * The surface ladder for a ground: canvas, then as many steps as asked for.
 *
 * ⚠️ IN LIGHT, ONLY THE FIRST STEP IS A LIGHTNESS STEP. Page to card takes most
 * of the room, and everything above the card is near-white — told apart by
 * `--elevation-1..3` instead. In dark it is the mirror image: four lightness
 * steps and no shadow at all. Asserting one rule for both is what would force
 * either grey cards in light or invisible shadows in dark.
 */
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

/* ------------------------------------------------------------------ tone --- */

export interface Tone {
  /** The saturated fill, for anything that must interrupt. */
  readonly fill: Oklch;
  /** ⚠️ Ink of the SAME HUE, never neutral. See below. */
  readonly ink: Oklch;
  /** A tint of the tone, close to the ground — for a message inside content. */
  readonly soft: Oklch;
  readonly softInk: Oklch;
}

/**
 * A semantic hue, lit for one surface, in the two forms a product needs.
 *
 * ⚠️ INK ON A SEMANTIC FILL IS THE SAME HUE, NOT BLACK OR WHITE. `inkOn` picks
 * the winner of near-white and near-dark, which is right for a neutral surface
 * and wrong here: black text on a green pill reads as a sticker rather than as a
 * message, and the two colours have no relationship at all. Deep green on the
 * same green does, and it is what every considered palette does — the hue is
 * held and only the lightness moves until it clears the floor.
 *
 * ⚠️ AND THERE ARE TWO FORMS BECAUSE THERE ARE TWO JOBS. A failure that must
 * interrupt gets the saturated `fill`; a note that sits INSIDE content gets
 * `soft` — a tint of the same hue, which does not shout across a page it is only
 * a paragraph of. Shipping one form makes every message the same volume, and a
 * product where everything shouts is one where nothing does.
 */
export function toneOn(tone: Oklch, surface: Oklch): Tone {
  const fill = accentOn(tone, surface, FLOOR.nonText);
  /*
    The tint: the tone's hue at the surface's own lightness, nudged away from it
    so the shape is visible, with the chroma well under the ambience ceiling so a
    soft callout can never be mistaken for the page.
  */
  const away = surface.l > 0.5 ? -0.06 : 0.09;
  const soft: Oklch = { l: Math.min(0.97, Math.max(0.14, surface.l + away)), c: 0.045, h: tone.h };
  return { fill, ink: sameHueInk(tone.h, fill), soft, softInk: sameHueInk(tone.h, soft) };
}

/**
 * ⚠️ THE HUE IS HELD AND ONLY THE LIGHTNESS MOVES. Walking both ends and keeping
 * whichever clears the floor first is what stops a mid-lightness tone (an amber,
 * say) from having no legible same-hue ink at all — it takes the dark end there
 * and the light end on a deep blue, without either being written down.
 */
function sameHueInk(hue: number, on: Oklch): Oklch {
  const bg = oklchToRgb(on);
  let best: Oklch | null = null;
  let bestRatio = 0;
  for (const direction of [-1, 1]) {
    for (let step = 0.04; step <= 0.9; step += 0.02) {
      const l = on.l + direction * step;
      if (l <= 0.04 || l >= 0.99) break;
      /* Chroma falls away at the extremes, or the ink reads as a second fill. */
      const candidate: Oklch = { l, c: Math.min(0.14, 0.5 - Math.abs(l - 0.5)), h: hue };
      const ratio = contrast(oklchToRgb(candidate), bg);
      if (ratio >= FLOOR.text) return candidate;
      if (ratio > bestRatio) { bestRatio = ratio; best = candidate; }
    }
  }
  /*
    ⚠️ NOTHING OF THIS HUE CLEARS THE FLOOR — so the measured neutral wins. It is
    the only correct answer: legible beats on-brand, every time, and the fallback
    is stated rather than being an accident of the loop running out.
  */
  return best && bestRatio >= FLOOR.text ? best : rgbToOklch(inkOn(on).ink);
}
