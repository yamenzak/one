/**
 * CLOTH — a swept field of fine lines, and the family the premium dark grounds
 * always wanted to be.
 *
 * ⚠️ SEVEN HAND-WRITTEN AMBIENCES COLLAPSE INTO THIS ONE. `silk`, `linen`,
 * `wire`, `weave`, `drape`, `ridge` and `flow` were all the same idea — very fine
 * marks on a nearly black ground, at a hundredth of the contrast of anything
 * else — reached seven times with seven sets of hand-tuned constants. Three of
 * them already shared a generator and were called "one material at three
 * settings", which is the observation this file finishes: the settings are a
 * SEED.
 *
 * ⚠️ THE PREMIUM DARK GROUND IS A LINE FIELD, NOT A LIGHT, and that correction
 * cost a round when it was first found. The obvious reading of "high dynamic
 * range" is a bright source on black; at any strength that reads as a source it
 * is a BLOB — a smudge on the lens pulling the eye to a place with nothing in
 * it. What the products that do this well ship is the opposite: the eye reads
 * MATERIAL rather than light, and nothing competes with the one figure the
 * screen is for.
 *
 * ⚠️ A LINE FIELD BUNCHES OR IT IS WALLPAPER. Evenly spaced curves are wallpaper
 * however wavy each one is; spacing that opens and closes across the frame reads
 * as a surface with a shape under it, the way a contour map has a hill in it.
 * That is the power on the line index, and it is the loudest knob here.
 */

import type { Family, Palette } from "./scene.js";

/**
 * ⚠️ SAMPLED COARSELY AND DRAWN SMOOTH, WHICH IS BOTH CHEAPER AND BETTER. A
 * polyline fine enough not to facet needs a vertex every few units, and every
 * vertex is two numbers in a stylesheet; a Catmull-Rom through one fifth as many
 * points costs the same bytes and has no corners at all. The faceting is
 * invisible on a laptop and plainly there on a phone, which is the screen the
 * drawing is scaled UP on.
 *
 * ⚠️ ONLY `y` NEEDS A TANGENT. The samples are evenly spaced in `x`, so both
 * control points sit exactly a third of a step either side and the arithmetic
 * that is left is the curve's own.
 */
const smooth = (ys: readonly number[], step: number): string => {
  const at = (i: number) => ys[Math.max(0, Math.min(ys.length - 1, i))]!;
  const out = [`M0 ${Math.round(at(0))}`];
  for (let i = 0; i < ys.length - 1; i += 1) {
    const x0 = i * step;
    out.push(
      `C${Math.round(x0 + step / 3)} ${Math.round(at(i) + (at(i + 1) - at(i - 1)) / 6)}`
      + ` ${Math.round(x0 + (step * 2) / 3)} ${Math.round(at(i + 1) - (at(i + 2) - at(i)) / 6)}`
      + ` ${x0 + step} ${Math.round(at(i + 1))}`,
    );
  }
  return out.join("");
};

/**
 * THE WHOLE FIELD, DRAWN AT ONCE — see `Family.drawn`.
 *
 * ⚠️ EVERY WAVE IS A WHOLE NUMBER OF CYCLES ACROSS THE TILE, and that is not a
 * detail. The field repeats at the tile, so a curve whose value at `x = 0`
 * differs from its value at `x = w` shows a vertical crack down every repeat:
 * one pixel wide, perfectly straight, and the single most visible thing on a
 * quiet ground. Picking the harmonic as an INTEGER makes the seam impossible
 * rather than unlikely.
 *
 * ⚠️ AND THE SWEEP HAS TO BE A WHOLE NUMBER OF LINE SPACINGS TOO. A diagonal
 * field tiles only if the fall across the tile lands the last line exactly where
 * the first one was — otherwise the crack is horizontal instead of vertical.
 * `fall` is quantised to `n` spacings for that reason and no other.
 */
const weave = (ink: string) =>
  (_p: Palette, r: () => number, tile: { readonly w: number; readonly h: number }): string => {
    /* ⚠️ The four knobs the seven old names differed by, now a range each. */
    const lines = 22 + Math.floor(r() * 26);
    const bunch = 0.9 + r() * 0.6;
    const swell = 8 + r() * 92;
    const ripple = 2 + r() * 30;
    const alpha = 0.07 + r() * 0.07;
    const cycles = 1 + Math.floor(r() * 3);
    const ripples = cycles + 1 + Math.floor(r() * 4);
    const fall = Math.floor(r() * 3) - 1;

    const STEP = 40;
    const span = tile.h * 1.9;
    const gap = span / (lines - 1);
    const paths: string[] = [];

    for (let k = 0; k < lines; k += 1) {
      const t = k / (lines - 1);
      const base = -tile.h * 0.45 + Math.pow(t, bunch) * span;
      const amp = swell * (0.45 + 0.55 * Math.sin(t * 2.2 + r() * 0.01));
      const ys: number[] = [];
      for (let x = 0; x <= tile.w; x += STEP) {
        const u = (x / tile.w) * Math.PI * 2;
        ys.push(
          base
          + amp * Math.sin(cycles * u + t * 1.35)
          + ripple * Math.sin(ripples * u + t * 3.4)
          /* ⚠️ Whole spacings, so the last line lands on the first — see above. */
          + (x / tile.w) * fall * gap,
        );
      }
      paths.push(
        `<path d="${smooth(ys, STEP)}"`
        + ` stroke-opacity="${(alpha * (0.55 + 0.45 * Math.sin(t * 3.1))).toFixed(3)}"/>`,
      );
    }

    /* ⚠️ Shared attributes on the `<g>`: the whole drawing is one string in a
       document, so an attribute repeated fifty times is fifty copies of it. */
    return `<g fill="none" stroke="${ink}" stroke-width="1">${paths.join("")}</g>`;
  };

const NIGHT: Family = {
  id: "cloth.night",
  slots: ["deep", "lit"],
  ink: "fixed",
  tile: { w: 1400, h: 1000 },
  drawn: weave("#fff"),
  veil: (p) => `color-mix(in oklab, ${p.deep} 90%, #000)`,
  /*
    ⚠️ THE DRAWING IS THE WHOLE GROUND HERE. Everything under it is restraint:
    one very wide, very low pole so the field has somewhere slightly brighter for
    the lines to cross, and a crush so the far corner goes properly black rather
    than merely dark. No source — the lines are the subject and a light would
    out-shout them.
  */
  ground: (p, r) => [
    `radial-gradient(140% 110% at ${40 + r() * 40}% -8%, transparent 24%,`
      + ` color-mix(in oklab, ${p.deep} 88%, #000) 100%)`,
    `radial-gradient(${140 + r() * 40}% 88% at ${40 + r() * 40}% -10%,`
      + ` color-mix(in oklab, ${p.lit} 7%, transparent) 0%, transparent 76%)`,
    `linear-gradient(180deg, ${p.deep} 0%, color-mix(in oklab, ${p.deep} 82%, #000) 100%)`,
  ],
};

/**
 * ⚠️ BLACK THREAD AT A THIRD THE WEIGHT, and this is the sign problem the old
 * file spent a knob on. A white line on near-black is light caught on a fibre
 * and may be quite present; the same line in black on paper is INK, and a dense
 * field of dark marks on light paper has a name: grime. Same pitch, a third of
 * the voice.
 */
const DAY: Family = {
  id: "cloth.day",
  slots: ["deep", "lit"],
  ink: "fixed",
  tile: { w: 1400, h: 1000 },
  drawn: weave("#000"),
  veil: (p) => `color-mix(in oklab, ${p.deep} 9%, #fff)`,
  ground: (p, r) => [
    `radial-gradient(${140 + r() * 40}% 88% at ${40 + r() * 40}% -10%,`
      + ` color-mix(in oklab, ${p.lit} 11%, #fff) 0%, transparent 74%)`,
    `radial-gradient(150% 118% at ${40 + r() * 40}% 6%, #fff 24%,`
      + ` color-mix(in oklab, ${p.deep} 14%, #fff) 100%)`,
  ],
};

export const CLOTH = { night: NIGHT, day: DAY } as const;
