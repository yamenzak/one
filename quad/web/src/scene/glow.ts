/**
 * GLOW — light, and nothing else.
 *
 * ⚠️ THIS ONE FAMILY REPLACES NINE HAND-WRITTEN AMBIENCES. `calm`, `focus`,
 * `lift`, `mesh`, `veil`, `tide`, `spotlight`, `bloom` and `aurora` were nine
 * afternoons spent placing two to four soft poles of the brand at different
 * strengths, and the difference between any two of them is where the poles are
 * and how hard they burn. That is a SEED, not nine files — and where nine names
 * gave nine grounds, this gives every ground in that space, which is what a
 * family is for.
 *
 * ⚠️ NO MARKS AT ALL, AND IT IS THE ONLY ONE. Every other family draws
 * something; this is pure light on a ground, which is exactly what most screens
 * want behind them. Its field is empty and its whole variation is in the
 * gradients — so it is also the proof that a seeded GROUND is a real capability
 * rather than a note, because there is nothing else here to vary.
 *
 * ⚠️ A BRIGHT LIGHT IS NOT A SATURATED ONE, and this is the half every CSS glow
 * gets wrong. Turn a hue up and you get more of that hue; turn a real source up
 * and it goes toward WHITE, because the sensor runs out of range before the
 * light does. A pure-brand core at ninety percent is a bright purple circle. A
 * brand core mixed most of the way to white, with the brand surviving in the
 * bloom around it, is a lamp.
 *
 * ⚠️ AND THE DARK IS A LAYER, NOT AN ABSENCE. Without a crush the corners are
 * exactly as bright as the middle, which never happens to a real surface and
 * reads as "filled" rather than "photographed". It is what gives a source
 * somewhere to be brighter THAN.
 */

import type { Family, Palette } from "./scene.js";

/** ⚠️ A light goes toward white as it brightens — see the header. */
const lamp = (p: Palette) => `color-mix(in oklab, ${p.lit} 40%, #fff)`;

const between = (r: () => number, lo: number, hi: number) => +(lo + r() * (hi - lo)).toFixed(1);

/**
 * ONE POLE, PLACED AND SIZED BY THE STREAM.
 *
 * ⚠️ THE RANGES ARE THE REVIEW. Nothing a seed can reach escapes them, so the
 * whole family was approved once rather than each world being approved on
 * arrival — which is the property that makes "endless" and "governed" the same
 * sentence rather than opposite ones.
 */
const pole = (r: () => number, colour: string, strength: number, into: string) =>
  `radial-gradient(${between(r, 48, 108)}% ${between(r, 34, 72)}%`
  + ` at ${between(r, -6, 104)}% ${between(r, -14, 72)}%,`
  + ` color-mix(in oklab, ${colour} ${strength}%, ${into}) 0%, transparent ${between(r, 62, 82)}%)`;

/**
 * ⚠️ THREE POLES AND A CRUSH, WHICH IS THE FEWEST THAT READS AS A ROOM. One is a
 * blur. Two is a gradient. Three at different values is somewhere the light
 * comes from more than one direction, which is what every lit surface actually
 * is — and the crush is what stops the whole thing floating.
 *
 * ⚠️ THE FIRST POLE IS THE HOTTEST AND IT IS DRAWN FIRST, so the two under it
 * are the falloff rather than competitors. Equal strengths give three smudges.
 */
const NIGHT: Family = {
  id: "glow.night",
  slots: ["deep", "lit"],
  ink: "fixed",
  tile: { w: 1400, h: 1000 },
  veil: (p) => `color-mix(in oklab, ${p.deep} 82%, #000)`,
  /*
    ⚠️ STRONGER THAN IT LOOKS ON PAPER, BECAUSE THE PALETTE MAY HAVE NO CHROMA.
    The first numbers were tuned against a hue and this product is MONOCHROME —
    a whitened grey at a fifth over near-black is a change of about eight values,
    which is a screen somebody would call flat rather than lit. A family whose
    palette can be `var(--brand)` has to carry its presence in VALUE, because
    that is the only channel a mono theme has.
  */
  ground: (p, r) => [
    pole(r, lamp(p), between(r, 24, 40), "transparent"),
    pole(r, lamp(p), between(r, 11, 21), "transparent"),
    pole(r, p.lit!, between(r, 8, 16), "transparent"),
    /* ⚠️ Toward the page's own ground rather than to black, so it works under
       any brand and in either theme. */
    `radial-gradient(${between(r, 120, 160)}% 118% at ${between(r, 20, 80)}% ${between(r, 8, 36)}%,`
      + ` transparent 30%, color-mix(in oklab, ${p.deep} 66%, #000) 100%)`,
    `linear-gradient(180deg, ${p.deep} 0%, color-mix(in oklab, ${p.deep} 84%, #000) 100%)`,
  ],
};

/**
 * ⚠️ ON PAPER THE LIGHT IS THE ABSENCE OF TINT, which is the whole inversion. A
 * pale pole added to white is invisible; what a daylight room has is colour at
 * its EDGES and nothing in the middle. Reaching for this by turning the night
 * poles down produces grey, every time.
 */
const DAY: Family = {
  id: "glow.day",
  slots: ["deep", "lit"],
  ink: "fixed",
  tile: { w: 1400, h: 1000 },
  veil: (p) => `color-mix(in oklab, ${p.deep} 10%, #fff)`,
  ground: (p, r) => [
    pole(r, p.lit!, between(r, 18, 30), "#fff"),
    pole(r, p.lit!, between(r, 8, 16), "#fff"),
    pole(r, p.deep!, between(r, 6, 13), "transparent"),
    `radial-gradient(${between(r, 120, 160)}% 118% at ${between(r, 20, 80)}% ${between(r, 8, 36)}%,`
      + ` #fff 22%, color-mix(in oklab, ${p.deep} 16%, #fff) 100%)`,
  ],
};

export const GLOW = { night: NIGHT, day: DAY } as const;
