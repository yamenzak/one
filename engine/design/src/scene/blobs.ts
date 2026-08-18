/**
 * BLOBS — the family whose MARKS are generated, not chosen.
 *
 * ⚠️ EVERY FAMILY BEFORE THIS ONE PICKS FROM A LIST. A star is one of five
 * magnitudes, a cloud one of four radii, a truchet tile one of four rotations —
 * the seed decides WHICH, and the shapes themselves were written by hand. This
 * one has no shapes. A silhouette is computed from the stream: a closed curve
 * whose radius wanders under two harmonics, so no two are alike and all of them
 * are unmistakably the same kind of thing. That is the difference between a
 * variant list and a generator, and it is the honest answer to whether the seed
 * really yields endless variation — here it yields the drawing itself.
 *
 * ⚠️ AND IT IS THE ONE PLACE A `draw` USES ITS OWN STREAM. `Variant.draw` has
 * always been handed the rng and no family had ever taken it, so the hook was a
 * claim rather than a capability. The engine passes ONE stream through
 * everything — placement, selection, and now shape — which is what keeps a world
 * reproducible: change any of the three and the whole field is different, the
 * same way it is different for the next seed.
 *
 * ⚠️ A SILHOUETTE, NOT A GLOW, which is what separates this from `aura`. Both
 * are big soft organic things; an aura is a gradient with no edge anywhere,
 * while a blob has a definite outline at very low alpha — papercut rather than
 * lamplight. Overlapped, the edges cross and the overlaps read as depth.
 *
 * ⚠️ THE INK IS FIXED — see `Family.ink`. This is the deployment's own ground,
 * and the deployment has no generated picture to read colours out of, only the
 * theme. `var(--brand)` inside an SVG is a string rather than a colour, so the
 * shapes are white or black and the ground carries the hue.
 */

import type { Family, Palette } from "./scene.js";

/**
 * A CLOSED CURVE FROM A STREAM.
 *
 * ⚠️ POLAR, WITH TWO HARMONICS, AND BOTH ARE LOAD-BEARING. One harmonic gives an
 * egg — a shape with a single fat end, which reads as a mistake rather than as a
 * form. Two at different frequencies interfere, so the outline swells and pinches
 * in a way that has no obvious period, which is what makes it read as organic
 * rather than as a wave wrapped round a circle.
 *
 * ⚠️ CATMULL-ROM THROUGH THE SAMPLES, CLOSED. A polygon of twelve points is a
 * gem; the same twelve points as a smooth closed spline is a blob. Both control
 * points sit a third of a step either side, exactly as `smooth` does for the
 * weaves — the samples are evenly spaced in ANGLE, so the arithmetic that is left
 * is the curve's own.
 */
const silhouette = (r: () => number, size: number): string => {
  const n = 12;
  const wobble = 0.16 + r() * 0.2;
  const [a, b] = [2 + Math.floor(r() * 2), 3 + Math.floor(r() * 3)];
  const [pa, pb] = [r() * Math.PI * 2, r() * Math.PI * 2];
  const squash = 0.72 + r() * 0.42;

  const at = (i: number): readonly [number, number] => {
    const t = ((i % n) + n) % n;
    const ang = (t / n) * Math.PI * 2;
    const rad = size * (1 + wobble * Math.sin(a * ang + pa) + wobble * 0.6 * Math.cos(b * ang + pb));
    return [rad * Math.cos(ang), rad * Math.sin(ang) * squash];
  };

  const out: string[] = [`M${at(0)[0]!.toFixed(1)} ${at(0)[1]!.toFixed(1)}`];
  for (let i = 0; i < n; i += 1) {
    const [x0, y0] = at(i);
    const [x1, y1] = at(i + 1);
    const [xb, yb] = at(i - 1);
    const [xn, yn] = at(i + 2);
    out.push(
      `C${(x0 + (x1 - xb) / 6).toFixed(1)} ${(y0 + (y1 - yb) / 6).toFixed(1)}`
      + ` ${(x1 - (xn - x0) / 6).toFixed(1)} ${(y1 - (yn - y0) / 6).toFixed(1)}`
      + ` ${x1.toFixed(1)} ${y1.toFixed(1)}`,
    );
  }
  return `${out.join("")}Z`;
};

/**
 * ⚠️ FILLED **OR** OUTLINED, AND THE MIX IS THE TEXTURE. A field of filled
 * shapes is a lava lamp — pleasant, and it has no detail to reward looking. An
 * outline at the same size crossing a fill is where the depth comes from: two
 * edges meeting at a shallow angle is a thing the eye follows, and it costs one
 * variant.
 */
const filled = (ink: string, size: number, a: number) => (_p: Palette, r: () => number) =>
  `<path d="${silhouette(r, size)}" fill="${ink}" fill-opacity="${a}"/>`;

const outlined = (ink: string, size: number, a: number) => (_p: Palette, r: () => number) =>
  `<path d="${silhouette(r, size)}" fill="none" stroke="${ink}"`
  + ` stroke-opacity="${a}" stroke-width="1.4"/>`;

/**
 * ⚠️ FOUR PER MEGAPIXEL. Fewer than any other family here, because each one is
 * two hundred pixels across and three of them already fill a phone. A count that
 * looks sparse in this file is a field that is legible on the screen; the
 * temptation to double it is the same one that turns every generative background
 * into soup.
 */
const shapes = (ink: string, fill: number, line: number) => ({
  id: "blob",
  per: 4,
  variants: [
    { weight: 3, draw: filled(ink, 190, fill), beat: "swell" as const, moving: 0.5 },
    { weight: 2, draw: outlined(ink, 240, line), beat: "breathe" as const, moving: 0.6 },
    { weight: 2, draw: filled(ink, 110, fill * 1.4), beat: "breathe" as const, moving: 0.55 },
    { weight: 1, draw: outlined(ink, 130, line * 1.3), beat: "swell" as const, moving: 0.65 },
  ],
});

/**
 * ⚠️ AND IT IS WEAK, FOR THE REASON `loops` SPELLS OUT: a `fixed`-ink family's
 * `lit` is `var(--brand)`, and this product is monochrome, so a quarter of it is
 * a grey wash rather than a colour.
 *
 * ⚠️ THE GROUND IS SEEDED HERE TOO — see `loops`. It matters more for the
 * deployment's own door than anywhere: that page has a fixed seed, so this is
 * the difference between a ground somebody composed and a ground that happens to
 * be the family's defaults.
 */
const NIGHT: Family = {
  id: "blobs.night",
  slots: ["deep", "lit"],
  ink: "fixed",
  tile: { w: 1280, h: 960 },
  specks: [shapes("#fff", 0.045, 0.1)],
  veil: (p) => `color-mix(in oklab, ${p.deep} 86%, #000)`,
  ground: (p, r) => [
    `radial-gradient(${52 + r() * 30}% ${40 + r() * 22}% at ${14 + r() * 70}% ${10 + r() * 30}%,`
      + ` color-mix(in oklab, ${p.lit} 9%, transparent) 0%, transparent 74%)`,
    `radial-gradient(${64 + r() * 34}% ${48 + r() * 20}% at ${10 + r() * 76}% ${64 + r() * 28}%,`
      + ` color-mix(in oklab, ${p.lit} 5%, transparent) 0%, transparent 78%)`,
    `linear-gradient(${150 + Math.round(r() * 60)}deg, ${p.deep} 0%,`
      + ` color-mix(in oklab, ${p.deep} 78%, #000) 100%)`,
  ],
};

const DAY: Family = {
  id: "blobs.day",
  slots: ["deep", "lit"],
  ink: "fixed",
  tile: { w: 1280, h: 960 },
  /* ⚠️ Black at a third — ink on paper, not light on an edge. See `loops`. */
  specks: [shapes("#000", 0.022, 0.055)],
  veil: (p) => `color-mix(in oklab, ${p.deep} 9%, #fff)`,
  ground: (p, r) => [
    `radial-gradient(${52 + r() * 30}% ${40 + r() * 22}% at ${14 + r() * 70}% ${10 + r() * 30}%,`
      + ` color-mix(in oklab, ${p.lit} 13%, #fff) 0%, transparent 72%)`,
    `radial-gradient(${64 + r() * 34}% ${48 + r() * 20}% at ${10 + r() * 76}% ${64 + r() * 28}%,`
      + ` color-mix(in oklab, ${p.lit} 7%, #fff) 0%, transparent 78%)`,
    `linear-gradient(${150 + Math.round(r() * 60)}deg, color-mix(in oklab, ${p.deep} 3%, #fff) 0%,`
      + ` color-mix(in oklab, ${p.deep} 15%, #fff) 100%)`,
  ],
};

export const BLOBS = { night: NIGHT, day: DAY } as const;
