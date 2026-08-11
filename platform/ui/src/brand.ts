/**
 * THE BRAND CONTRACT — a closed set of slots, each with a range every value of
 * which is safe.
 *
 * ⚠️ "A TENANT'S BAD PALETTE IS NOT THEIR PROBLEM" IS A CLAIM THAT HAS TO BE
 * TRUE BY CONSTRUCTION, and it is only true if the surface is small enough to
 * prove exhaustively. Eight bounded slots can be swept. An open token map cannot
 * be swept, cannot be reasoned about, and turns every support conversation about
 * an unreadable screen into an investigation.
 *
 * What is deliberately absent is as load-bearing as what is here: semantic hues
 * (danger is not a brand decision), the type scale (a family swaps; the rhythm
 * does not), spacing, motion, and every `*-foreground` token — those are
 * measured, and offering one would let a tenant pair a colour with ink that
 * fails on it, which is the one thing the token exists to prevent.
 */

import { fromHex, oklchToRgb, rgbToOklch, toHex, type Oklch } from "./colour.js";
import { accentOn, inkOn, surfaces, toneOn, type Ground, type Theme } from "./ground.js";
import { SEMANTIC } from "./semantic.js";

/* ----------------------------------------------------------------- slots --- */

export type Edge = "none" | "hairline" | "defined";
export type Elevation = "flat" | "soft";
export type Density = "comfortable" | "compact";

export interface Brand {
  /** Any hue. Chroma and lightness are re-fitted per ground. */
  readonly accent: string;
  /** A ground family: a hue, and how much of it. ⚠️ Chroma-capped by the range. */
  readonly ambience: { readonly hue: number; readonly intensity: number };
  readonly radius: number;
  readonly edge: Edge;
  readonly elevation: Elevation;
  readonly density: Density;
  readonly type: string;
  readonly logo?: { readonly light?: string; readonly dark?: string };
}

/**
 * ⚠️ THE RANGE IS THE GUARANTEE. A slot's bounds are chosen so that no
 * combination inside them can produce an unreadable screen — and the sweep in
 * `test/contrast.test.ts` walks them rather than sampling, because a range
 * nobody walked is a range with a hole somewhere in the middle of it.
 */
export const RANGE = {
  radius: { min: 8, max: 24 },
  /*
    ⚠️ AMBIENCE IS A WASH, AND THE CEILING IS WHAT KEEPS IT ONE. Past this
    chroma a ground reaches the saturation of a semantic fill, and "is that
    green a success or the page?" becomes a real question — which no amount of
    contrast checking answers.
  */
  ambienceIntensity: { min: 0, max: 0.06 },
  edge: ["none", "hairline", "defined"] as const,
  elevation: ["flat", "soft"] as const,
  density: ["comfortable", "compact"] as const,
  type: ["one/sans", "one/serif", "one/mono"] as const,
} as const;

export const DEFAULT_BRAND: Brand = {
  accent: "#3b5bdb",
  ambience: { hue: 250, intensity: 0.03 },
  radius: 16,
  edge: "hairline",
  elevation: "soft",
  density: "comfortable",
  type: "one/sans",
};

export interface SlotProblem { readonly slot: string; readonly detail: string }

/**
 * ⚠️ A BRAND OUTSIDE ITS RANGE IS REFUSED, NOT CLAMPED.
 *
 * Clamping accepts a value and renders something else, so a tenant who typed 40
 * sees 24 and concludes the setting does not work. Refusing says which slot and
 * what the bounds are, once, at the moment they are choosing.
 */
export function validateBrand(brand: Brand): readonly SlotProblem[] {
  const out: SlotProblem[] = [];
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(brand.accent)) out.push({ slot: "accent", detail: "must be a hex colour" });
  if (brand.radius < RANGE.radius.min || brand.radius > RANGE.radius.max) {
    out.push({ slot: "radius", detail: `must be between ${RANGE.radius.min} and ${RANGE.radius.max}` });
  }
  const { intensity, hue } = brand.ambience;
  if (intensity < RANGE.ambienceIntensity.min || intensity > RANGE.ambienceIntensity.max) {
    out.push({ slot: "ambience", detail: `intensity must be between ${RANGE.ambienceIntensity.min} and ${RANGE.ambienceIntensity.max}` });
  }
  if (hue < 0 || hue >= 360) out.push({ slot: "ambience", detail: "hue must be 0–359" });
  if (!RANGE.edge.includes(brand.edge)) out.push({ slot: "edge", detail: `must be one of: ${RANGE.edge.join(", ")}` });
  if (!RANGE.elevation.includes(brand.elevation)) out.push({ slot: "elevation", detail: `must be one of: ${RANGE.elevation.join(", ")}` });
  if (!RANGE.density.includes(brand.density)) out.push({ slot: "density", detail: `must be one of: ${RANGE.density.join(", ")}` });
  if (!RANGE.type.includes(brand.type as (typeof RANGE.type)[number])) out.push({ slot: "type", detail: `must be one of: ${RANGE.type.join(", ")}` });
  return out;
}

/* ---------------------------------------------------------------- ground --- */

/**
 * The canvas a theme starts from.
 *
 * ⚠️ NEAR-BLACK AND NEAR-WHITE, NOT BLACK AND WHITE. Pure black gives a dark
 * theme nowhere to step DOWN to and makes every elevation one-directional; pure
 * white does the same at the other end. Both also read as harsher than any
 * screen needs to be.
 */
export function groundFor(brand: Brand, theme: Theme): Ground {
  const { hue, intensity } = brand.ambience;
  /*
    ⚠️ THE DECLARED INTENSITY IS USED, NOT A SECOND CAP ON TOP OF THE RANGE. A
    range that says 0–0.06 and a resolver that quietly allows 0.02 is a slot
    whose upper half does nothing — a tenant moves the control, sees no change,
    and the sweep proves a range the product does not actually offer.
  */
  const c = Math.max(0, Math.min(intensity, RANGE.ambienceIntensity.max));
  /*
    ⚠️ THE SAME CHROMA READS ROUGHLY TWICE AS STRONG ON A LIGHT GROUND, so the
    light canvas carries a fraction of it. The slot promises "a hue, and how much
    of it" — which is a promise about what somebody SEES, not about what number
    is in the file. Dropping the page from 0.975 to 0.93 to make the cards white
    tripled the visible tint at an unchanged setting; this is that correction, in
    one place, rather than every tenant re-tuning a value that did not move.
  */
  const LIGHT_TINT = 0.45;
  /*
    ⚠️ THE LIGHT PAGE IS NOT WHITE, AND THAT IS WHAT MAKES THE CARDS WHITE. At
    0.975 the page was already at the ceiling, so every surface above it had to
    step DOWN and a card came out grey — the dusty look that makes a light theme
    read as cheap. The page sits low enough for the ladder to climb, and the card
    is the near-white thing on it.
  */
  const canvas: Oklch = theme === "dark" ? { l: 0.17, c, h: hue } : { l: 0.93, c: c * LIGHT_TINT, h: hue };
  return { theme, canvas, accent: rgbToOklch(fromHex(brand.accent)) };
}

/* ---------------------------------------------------------------- tokens --- */

export interface Tokens { readonly [name: string]: string }

/**
 * Every token a component may reach, resolved for one brand and one theme.
 *
 * ⚠️ THERE IS NO ESCAPE HATCH AND NO PASSTHROUGH. A component that could receive
 * an arbitrary colour is a component the sweep cannot reason about — and one
 * arbitrary colour is all it takes for the guarantee above to stop being one.
 */
export function tokensFor(brand: Brand, theme: Theme): Tokens {
  const ground = groundFor(brand, theme);
  const ladder = surfaces(ground, 3);
  const out: Record<string, string> = {};

  ladder.forEach((surface, i) => {
    const name = i === 0 ? "canvas" : `surface-${i}`;
    out[`--${name}`] = toHex(oklchToRgb(surface));
    out[`--${name}-ink`] = toHex(inkOn(surface).ink);
    /*
      ⚠️ THE ACCENT IS RE-LIT PER SURFACE, not once per theme. The same brand on
      a card and on the page is the same hue at two lightnesses, because the two
      surfaces are different distances from it.
    */
    const lit = accentOn(ground.accent, surface);
    out[`--${name}-accent`] = toHex(oklchToRgb(lit));
    out[`--${name}-accent-ink`] = toHex(inkOn(lit).ink);
  });

  /*
    ⚠️ THE SEMANTIC TONES ARE TOKENS TOO, AND THEY ARE RE-LIT LIKE THE ACCENT.
    A fixed danger red is legible on one of the two themes; the hue is the
    platform's and never a brand slot, but WHERE it sits on the lightness axis is
    still a question about the ground it lands on. Without these, every component
    that needs a fault colour reaches for a literal — and one literal is all it
    takes for the tenant sweep to stop being a proof.
  */
  for (const [name, hue] of Object.entries(SEMANTIC)) {
    const tone = toneOn(hue, ground.canvas);
    out[`--tone-${name}`] = toHex(oklchToRgb(tone.fill));
    out[`--tone-${name}-ink`] = toHex(oklchToRgb(tone.ink));
    /* ⚠️ The quiet form. A note inside content must not shout across a page it
       is only a paragraph of — one form makes every message the same volume. */
    out[`--tone-${name}-soft`] = toHex(oklchToRgb(tone.soft));
    out[`--tone-${name}-soft-ink`] = toHex(oklchToRgb(tone.softInk));
  }

  out["--radius"] = `${brand.radius}px`;
  out["--radius-sm"] = `${Math.max(4, brand.radius - 4)}px`;
  out["--radius-lg"] = `${brand.radius + 4}px`;
  /*
    ⚠️ AN OPTICAL HAIRLINE, NOT A LITERAL PIXEL. A hardcoded 1px is heavy at 1×
    and invisible at 3×, so a system that ships one looks different on every
    screen it reaches.
  */
  out["--edge"] = brand.edge === "none" ? "0" : brand.edge === "hairline" ? "max(0.5px, 0.0625rem)" : "max(1px, 0.125rem)";
  /*
    ⚠️ ELEVATION IS GRADED, AND IN LIGHT IT IS WHAT CARRIES DEPTH AT ALL. A light
    ground has almost no room above it, so surfaces 1 to 3 are all near-white and
    the shadow is the only thing that tells them apart — which is how a bright
    room works: everything is already lit, and things are read by what they cast.
    A dark ground is the mirror image, so every one of these is `none` there and
    the lightness ladder does the work. A shadow on near-black is invisible, and
    every pixel spent drawing one is a pixel that makes nothing clearer.
  */
  const lifted = brand.elevation !== "flat" && theme === "light";
  out["--elevation-1"] = lifted ? "0 1px 2px rgb(0 0 0 / 0.04), 0 2px 8px rgb(0 0 0 / 0.05)" : "none";
  out["--elevation-2"] = lifted ? "0 2px 4px rgb(0 0 0 / 0.05), 0 8px 20px rgb(0 0 0 / 0.07)" : "none";
  out["--elevation-3"] = lifted ? "0 4px 8px rgb(0 0 0 / 0.06), 0 18px 40px rgb(0 0 0 / 0.10)" : "none";
  /* The unqualified one is depth 1, so a caller that does not know its depth is
     still lit rather than flat. */
  out["--elevation"] = out["--elevation-1"]!;
  out["--density"] = brand.density === "compact" ? "0.875" : "1";
  out["--type"] = brand.type;
  return out;
}
