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
 *
 * ⚠️ AND THE LIGHT WRAPS, WHICH IS THE ONE THING THIS FAMILY MAY NOT LEAVE TO
 * THE SEED. `glow` lets three poles land wherever the stream puts them, and on a
 * big page that reads as a room. This family's surface is a CARD — wide, short,
 * and cropped to a few hundred pixels — so three free poles can and did land on
 * one side of it, giving a ground that is tinted on the left and plain on the
 * right. That is not a world, it is a smudge. Both sides are lit in every world
 * this family makes; the seed chooses which of them BURNS, and that is the whole
 * of its freedom over placement.
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

/**
 * ⚠️ AND THE POLES AWAY FROM THE HOT ONE ARE LIT TOO, WHICH IS WHAT MAKES THE
 * WRAP VISIBLE RATHER THAN MERELY PRESENT. Measured: a whitened pole read 14
 * points of green above the card's own ground and a pole of the raw hue, at the
 * opposite corner and nominally a similar strength, read 2.5 — because a
 * mid-lightness green at a quarter alpha over a near-black card is almost
 * exactly the card. Placement alone does not distribute a tint; the light does.
 */
const haze = `color-mix(in oklab, ${GREEN} 68%, #fff)`;

/**
 * THREE PLACES A POLE MAY GO, AND THEY ARE THE THREE THE MATTE LEAVES VISIBLE.
 *
 * ⚠️ THE MASK IS PART OF THE COMPOSITION, WHICH IS WHAT THE FIRST TWO ATTEMPTS
 * AT THIS MISSED. `MATTE` fades every ground out below 62% of its height and
 * hollows an ellipse down the reading column — so a ground is only ever SEEN at
 * the top and along the two sides. Poles placed by the four corners measured
 * beautifully in the gradient string and produced a card lit on one side: the
 * two bottom ones were painting into the part of the mask that is not there.
 *
 * ⚠️ SO THE WRAP IS LEFT-TO-RIGHT, NOT CORNER-TO-CORNER. Both sides always carry
 * light, the top carries the third, and every world in the family is lit from at
 * least two directions on the part of it anybody sees.
 *
 * ⚠️ AND THEY SIT SLIGHTLY OUTSIDE THE BOX ON PURPOSE. A pole centred exactly on
 * the edge puts its hottest point where the rounded corner is cut away; centred
 * just off the surface, what the card gets is the falloff, which is the part
 * that reads as light rather than as a dot.
 */
interface Place { readonly x: readonly [number, number]; readonly y: readonly [number, number] }

const LEFT: Place = { x: [-10, 14], y: [-18, 24] };
const RIGHT: Place = { x: [86, 110], y: [-18, 24] };
const TOP: Place = { x: [28, 72], y: [-24, 4] };

/**
 * ONE POLE, SIZED BY THE STREAM AND PLACED WHERE IT WAS TOLD.
 *
 * ⚠️ THE RANGES ARE THE REVIEW — the same rule `glow` states. What is different
 * here is that the POSITION is an argument rather than a range: the family
 * decides which sides are lit, and the seed decides where along each and how far
 * the light carries.
 *
 * ⚠️ AND THE RADIUS IS LARGE BECAUSE THE ORIGIN IS AT AN EDGE. A pole in the
 * middle at 60% covers the surface; the same pole at a side covers half of it
 * and reads as a spot rather than as a side being lit.
 */
const pole = (r: () => number, colour: string, strength: number, into: string, at: Place) =>
  `radial-gradient(${between(r, 84, 132)}% ${between(r, 96, 164)}%`
  + ` at ${between(r, at.x[0], at.x[1])}% ${between(r, at.y[0], at.y[1])}%,`
  + ` color-mix(in oklab, ${colour} ${strength}%, ${into}) 0%, transparent ${between(r, 66, 84)}%)`;

/**
 * ⚠️ THE SEED CHOOSES WHICH SIDE IS THE HOT ONE AND NOTHING ELSE. Both sides are
 * lit in every world; which of them burns is the variation. That is the whole
 * constraint — a family free to put its light anywhere is a family that will
 * eventually put all of it in one place.
 */
const across = (r: () => number): readonly [Place, Place] =>
  (r() < 0.5 ? [LEFT, RIGHT] : [RIGHT, LEFT]);

const NIGHT: Family = {
  id: "tint.night",
  slots: ["deep", "lit"],
  ink: "fixed",
  tile: { w: 1400, h: 1000 },
  /* ⚠️ THE VEIL IS WHAT MAKES IT GLASS: near the ground, so the light under it
     reads as being SEEN THROUGH something rather than as being painted on. */
  veil: (p) => `color-mix(in oklab, ${p.deep} 78%, ${GREEN})`,
  ground: (p, r) => {
    const [hot, far] = across(r);
    return [
      pole(r, pane, between(r, 26, 33), "transparent", hot),
      pole(r, haze, between(r, 28, 35), "transparent", far),
      pole(r, haze, between(r, 24, 30), "transparent", hot),
      pole(r, haze, between(r, 8, 13), "transparent", TOP),
      /* ⚠️ ONE POLE OF THE THEME'S OWN LIGHT, so a workspace's brand still reaches
         this family. A ground that ignored the palette entirely would be the one
         surface in the product a tenant cannot brand. */
      pole(r, p.lit!, between(r, 7, 13), "transparent", far),
      /* ⚠️ NO VIGNETTE, BECAUSE THE MATTE ALREADY IS ONE. `glow` crushes its
         corners to give a central light somewhere to be brighter than; here the
         light is at the edges and the mask hollows the middle, so a crush would
         darken the one part of the ground that is already not drawn. */
      `linear-gradient(180deg, ${p.deep} 0%, color-mix(in oklab, ${p.deep} 88%, #000) 100%)`,
    ];
  },
};

/**
 * ⚠️ ON PAPER THE TINT IS AT THE EDGES — the same inversion `glow` documents. A
 * pale green added to white is invisible; what a daylit pane of glass has is
 * colour where it is thickest, which is its edge. The wrap is the same as the
 * night's, so the two themes are one world seen twice rather than two worlds.
 */
const DAY: Family = {
  id: "tint.day",
  slots: ["deep", "lit"],
  ink: "fixed",
  tile: { w: 1400, h: 1000 },
  veil: () => `color-mix(in oklab, ${GREEN} 8%, #fff)`,
  ground: (p, r) => {
    const [hot, far] = across(r);
    return [
      pole(r, GREEN, between(r, 24, 31), "#fff", hot),
      pole(r, GREEN, between(r, 21, 28), "#fff", far),
      pole(r, GREEN, between(r, 8, 13), "#fff", TOP),
      pole(r, p.deep!, between(r, 5, 11), "transparent", far),
      `linear-gradient(180deg, color-mix(in oklab, ${GREEN} 9%, #fff) 0%,`
        + ` color-mix(in oklab, ${GREEN} 16%, #fff) 100%)`,
    ];
  },
};

export const TINT = { night: NIGHT, day: DAY } as const;
