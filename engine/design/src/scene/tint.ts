/**
 * TINT — glass, and the one family that brings a hue of its own.
 *
 * ⚠️ EVERY OTHER FAMILY DRAWS IN THE THEME'S COLOURS, AND THIS ONE DOES NOT.
 * That is the whole reason it exists as a family rather than as a seed of
 * `glow`: this product is MONOCHROME, so `glow` on it is light with no colour in
 * it at all, and there is no seed of a mono palette that produces a tint. A
 * screen wanting one had to write a hue into itself, which `scene.test.mjs`
 * refuses and should.
 *
 * ⚠️ SO THE HUE IS DECLARED HERE, ONCE, AND IT IS A CONSTRAINT ON THE FAMILY
 * RATHER THAN A CHOICE AT A CALL SITE. Every world this family makes carries the
 * same green at a different placement and strength — which is what keeps
 * "tinted" one decision instead of one per screen.
 *
 * ⚠️ AND IT IS BARELY A COLOUR — BUT IT HAS TO BE VISIBLE. The first pass sat at
 * a chroma of 0.06, which measured correctly in the variable and could not be
 * seen: a low-chroma green at a quarter strength over a near-black ground is a
 * shift of a couple of values. Hue is scarce in a mono product and a green
 * anybody would call green is a second brand — so this is the narrow band where
 * a surface beside a `cloth` one is visibly cooler and still not nameable.
 *
 * ⚠️ THE GLASS IS THE VEIL, NOT A BLUR. There is no `backdrop-filter` here: a
 * blur behind a card costs a full-surface composite on every scroll frame, on a
 * phone, for a texture. What reads as glass is a bright edge-lit ground under a
 * near-transparent veil — the same trick `glow` uses for a lamp, with the light
 * carrying a tint.
 */

import type { Family, Palette } from "./scene.js";

/**
 * ⚠️ OKLCH, SO THE LIGHTNESS IS PERCEPTUAL. The same green in sRGB is a
 * different apparent brightness against the night ground and the day one, and
 * tuning it twice is how two themes come to disagree about how strong a tint is.
 */
const GREEN = "oklch(0.80 0.12 168)";

const between = (r: () => number, lo: number, hi: number) => +(lo + r() * (hi - lo)).toFixed(1);

/** ⚠️ A lit surface goes toward white as it brightens — see `glow`. */
const pane = `color-mix(in oklab, ${GREEN} 46%, #fff)`;

const pole = (r: () => number, colour: string, strength: number, into: string) =>
  `radial-gradient(${between(r, 52, 112)}% ${between(r, 36, 74)}%`
  + ` at ${between(r, -6, 104)}% ${between(r, -14, 70)}%,`
  + ` color-mix(in oklab, ${colour} ${strength}%, ${into}) 0%, transparent ${between(r, 64, 84)}%)`;

const NIGHT: Family = {
  id: "tint.night",
  slots: ["deep", "lit"],
  ink: "fixed",
  tile: { w: 1400, h: 1000 },
  /* ⚠️ THE VEIL IS WHAT MAKES IT GLASS: near the ground, so the light under it
     reads as being SEEN THROUGH something rather than as being painted on. */
  veil: (p) => `color-mix(in oklab, ${p.deep} 78%, ${GREEN})`,
  ground: (p, r) => [
    pole(r, pane, between(r, 34, 48), "transparent"),
    pole(r, GREEN, between(r, 18, 28), "transparent"),
    /* ⚠️ ONE POLE OF THE THEME'S OWN LIGHT, so a workspace's brand still reaches
       this family. A ground that ignored the palette entirely would be the one
       surface in the product a tenant cannot brand. */
    pole(r, p.lit!, between(r, 6, 12), "transparent"),
    `radial-gradient(${between(r, 120, 160)}% 118% at ${between(r, 20, 80)}% ${between(r, 8, 36)}%,`
      + ` transparent 32%, color-mix(in oklab, ${p.deep} 70%, #000) 100%)`,
    `linear-gradient(180deg, ${p.deep} 0%, color-mix(in oklab, ${p.deep} 86%, #000) 100%)`,
  ],
};

/**
 * ⚠️ ON PAPER THE TINT IS AT THE EDGES — the same inversion `glow` documents. A
 * pale green added to white is invisible; what a daylit pane of glass has is
 * colour where it is thickest, which is its edge.
 */
const DAY: Family = {
  id: "tint.day",
  slots: ["deep", "lit"],
  ink: "fixed",
  tile: { w: 1400, h: 1000 },
  veil: () => `color-mix(in oklab, ${GREEN} 8%, #fff)`,
  ground: (p, r) => [
    pole(r, GREEN, between(r, 16, 26), "#fff"),
    pole(r, GREEN, between(r, 7, 14), "#fff"),
    pole(r, p.deep!, between(r, 5, 11), "transparent"),
    `radial-gradient(${between(r, 120, 160)}% 118% at ${between(r, 20, 80)}% ${between(r, 8, 36)}%,`
      + ` #fff 24%, color-mix(in oklab, ${GREEN} 14%, #fff) 100%)`,
  ],
};

export const TINT = { night: NIGHT, day: DAY } as const;
