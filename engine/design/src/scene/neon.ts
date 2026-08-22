/**
 * NEON — black, one bright light in it, and the colour that light throws on
 * everything else.
 *
 * ⚠️ THIS IS THE FAMILY AN APP WEARS, AND IT IS THE FIRST ONE THAT COMMITS.
 * `glow` is three soft poles of whatever colour it was handed and `cloth` is a
 * fine field on near-black: both are *quiet*, both look the same from across a
 * room, and a product whose arrival screen is quiet has no arrival screen. What
 * a phone-first product reads as premium is a SOURCE — a single hard bright form
 * on a black ground, throwing its colour across everything near it. One light,
 * not three; a shape, not a haze.
 *
 * ⚠️ AND THE COLOUR LANDS ON THE COMPONENTS, WHICH IS THE HALF EVERY OTHER
 * FAMILY LEAVES OUT. A ground is behind the page; the controls on top of it stay
 * the grey they were, so the world reads as wallpaper hung behind a working
 * screen. `wash` is what this family publishes for the surfaces themselves — a
 * pill, a card, the bar — so the light appears to have fallen on them. The
 * alternative, a screen dimmed toward black under a coloured haze, is the effect
 * that looks expensive in a mock and washed-out on a phone in a kitchen.
 *
 * ⚠️ A LIGHT IS A GEOMETRY, NOT A BLUR — which is the whole difference from
 * `glow`. Two forms, both seeded:
 *
 * - a **RING** far larger than the frame, so what lands is an ARC: a line of
 *   light curving around whatever the screen leads with — cradling a figure from
 *   below, or sweeping the full width at the shallow end of the range.
 * - a **BEAM**: the same band, straight, crossing at an angle.
 *
 * ⚠️ THE CORE IS ALMOST WHITE AND THE HUE LIVES IN THE FALLOFF. Turn a hue up
 * and you get more of that hue; turn a real source up and it goes toward WHITE,
 * because the sensor runs out of range before the light does. A band of the raw
 * colour is a coloured stripe; a nearly-white core with the colour blooming
 * either side is a light. `glow` states the same law and it matters more here,
 * because the band is thin and hard and every failure of it is legible.
 *
 * ⚠️ AND THE BAND IS STEEP ON PURPOSE, WHICH IS ALSO WHAT MAKES IT CHEAP TO
 * ANIMATE. A shallow ramp over a large area is what bands on an 8-bit display —
 * which is why the grain exists and why everything under it is dithered — and a
 * hard bright edge has no shallow ramp to band. So the broad bloom stays in the
 * ground under the dither and the moving part is the band alone, on its own
 * layer, above it. See `FLARE` in `ambience.ts`.
 */

import type { Family, Ground, Palette } from "./scene.js";

const between = (r: () => number, lo: number, hi: number) => +(lo + r() * (hi - lo)).toFixed(1);

/**
 * ⚠️ THE HUE AT AN ALPHA, AND NEVER `transparent` AS A COLOUR. `transparent` is
 * transparent BLACK, so a bloom fading to it goes grey on the way out — a dirty
 * ring around every light, from a rule that never names a grey. `color-mix`
 * against `transparent` interpolates premultiplied, so this is the hue at that
 * alpha and nothing else.
 */
const halo = (p: Palette, pct: number) =>
  `color-mix(in oklab, ${p.lit} ${pct}%, transparent)`;

/**
 * WHAT THE HOTTEST POINT OF THE BAND IS, AND IT IS THE ONE THING THE TWO SKIES
 * DISAGREE ABOUT.
 *
 * ⚠️ ON BLACK A SOURCE IS WHITE; ON PAPER IT IS THE COLOUR. A white core on white
 * is nothing at all, and reaching for a day version by turning the night one
 * down gives grey every time — the relationship inverts rather than weakening.
 * Everything else about the family is identical across the two, which is what
 * makes them one world seen twice.
 */
type Hot = (p: Palette) => string;

/**
 * THE BAND, AS STOPS.
 *
 * ⚠️ ASYMMETRIC, AND THAT IS THE DIFFERENCE BETWEEN A LIGHT AND A TUBE. A band
 * that falls off equally either side is a drawn line; a real source has a short
 * bright shoulder on one side and a long bloom on the other, because one side is
 * looking into the lamp and the other is the room it lights.
 */
/**
 * ⚠️ THE PEAK IS NOT OPAQUE, AND THAT IS WHAT LETS TYPE SURVIVE CROSSING IT. A
 * band at full alpha is a white stripe: whatever it passes over is gone, and on
 * a phone what it passes over is a heading and two lines of body text. At three
 * quarters it still reads as the hottest thing on the screen — nothing else on a
 * black ground is anywhere near it — and the words underneath keep enough of
 * their own contrast to be read. Measured both ways on the same screen; opaque
 * is the version somebody reports as a rendering fault.
 */
const PEAK = 62;

const band = (p: Palette, hot: Hot, at: number, w: number): string => [
  `${halo(p, 0)} 0%`,
  `${halo(p, 0)} ${+(at - w * 2.4).toFixed(1)}%`,
  `${halo(p, 26)} ${+(at - w * 0.9).toFixed(1)}%`,
  `${halo(p, 62)} ${+(at - w * 0.3).toFixed(1)}%`,
  `color-mix(in oklab, ${hot(p)} ${PEAK}%, transparent) ${+at.toFixed(1)}%`,
  `${halo(p, 70)} ${+(at + w * 0.35).toFixed(1)}%`,
  `${halo(p, 30)} ${+(at + w * 1.1).toFixed(1)}%`,
  `${halo(p, 9)} ${+(at + w * 2.6).toFixed(1)}%`,
  `${halo(p, 0)} ${+(at + w * 5).toFixed(1)}%`,
].join(", ");

/**
 * A RING FAR BIGGER THAN THE FRAME, SO WHAT LANDS IS AN ARC.
 *
 * ⚠️ THE CENTRE SITS OFF THE PAGE, ALWAYS. A ring whose centre is on screen is a
 * halo drawn around nothing — a circle with the content inside it, which reads
 * as a target. Placed outside, the page gets one curve of it, and the curve is
 * what cradles a figure or sweeps a width.
 *
 * ⚠️ AND THE ASPECT IS MOST OF THE VARIATION. A tall narrow ring gives a steep
 * arc down one side; a wide flat one gives the long shallow sweep across the
 * whole width. One declaration, two worlds anybody would describe differently.
 */
const ring = (r: () => number, p: Palette, hot: Hot): string =>
  `radial-gradient(${between(r, 78, 190)}% ${between(r, 46, 132)}%`
  + ` at ${between(r, 4, 96)}% ${between(r, -34, 18)}%,`
  + ` ${band(p, hot, between(r, 44, 70), between(r, 1.1, 2.2))})`;

/**
 * ⚠️ A BEAM IS THE SAME BAND WITHOUT THE CURVE, and it exists because a ring
 * cannot cross a screen corner to corner. Steep angles only: a beam near the
 * horizontal is a horizon and one near the vertical is a seam, and both read as
 * the layout having a line in it rather than the room having a light.
 */
/**
 * ⚠️ AND ITS HOT POINT KEEPS OUT OF THE MIDDLE, WHICH IS THE ONE PLACEMENT RULE
 * THIS FAMILY CANNOT LEAVE TO THE SEED. A ring's centre is off the page, so what
 * lands is always a curve near an edge; a beam has no such geometry, and the
 * middle of its axis is the middle of the screen — which is where a home screen
 * puts the one figure it exists to show. Measured: a beam at 48% ran its white
 * core straight through the eyebrow, the number and the line under it. Both
 * outer thirds are still available, so nothing about the family narrows except
 * the one band that was never usable.
 */
const beam = (r: () => number, p: Palette, hot: Hot): string =>
  `linear-gradient(${(between(r, 24, 66) * (r() < 0.5 ? 1 : -1) + 90).toFixed(1)}deg,`
  + ` ${band(p, hot,
    r() < 0.5 ? between(r, 8, 30) : between(r, 70, 92),
    between(r, 1.4, 2.8))})`;

/**
 * ⚠️ THE BLOOM IS WHAT THE LIGHT DOES TO THE AIR, AND WITHOUT IT THE BAND IS A
 * DECAL. Broad, weak, and placed by the same stream as the form above it, so it
 * sits where the source is rather than somewhere else on the page.
 */
const bloom = (r: () => number, p: Palette): string =>
  `radial-gradient(${between(r, 80, 150)}% ${between(r, 60, 110)}%`
  + ` at ${between(r, 6, 94)}% ${between(r, -10, 44)}%,`
  + ` ${halo(p, between(r, 20, 34))} 0%, ${halo(p, 8)} 38%, ${halo(p, 0)} 76%)`;

/**
 * ⚠️ TWO FORMS AT MOST, AND USUALLY ONE. Three lights is a light show; one is a
 * room with a window in it. The second, when the seed gives one, is what lets
 * the first fall off TO something.
 */
const forms = (r: () => number, p: Palette, hot: Hot): readonly string[] => {
  const first = r() < 0.62 ? ring(r, p, hot) : beam(r, p, hot);
  const second = r() < 0.26 ? [r() < 0.5 ? ring(r, p, hot) : beam(r, p, hot)] : [];
  return [first, ...second];
};

/**
 * ⚠️ NEAR BLACK, AND IT IS THE FAMILY'S OWN GROUND RATHER THAN THE PAGE'S. Every
 * other family builds toward `deep` so it works under any theme; this one is a
 * night sky by definition. A bright hard source needs somewhere genuinely dark
 * to be bright against, and a `deep` a theme happened to lift to a mid grey
 * would give a light with no contrast and a wash with nothing to wash.
 */
const PITCH = "color-mix(in oklab, var(--background) 62%, #000)";

const NIGHT: Family = {
  id: "neon.night",
  slots: ["deep", "lit"],
  ink: "fixed",
  tile: { w: 1400, h: 1000 },
  /*
    ⚠️ THE VEIL CARRIES A TRACE OF THE HUE AND THE WASH CARRIES A LOT, and they
    are two answers rather than one at two strengths. The veil is what type sits
    against and what the hem is made of, so it has to be the GROUND — otherwise a
    heading gets a coloured shadow and the bar stops looking like the page
    thickening under it. The wash is what a CONTROL is made of, and a control is
    supposed to look lit.
  */
  veil: (p) => `color-mix(in oklab, ${p.lit} 7%, ${PITCH})`,
  /*
    ⚠️ THE HUE WHOLE, AND THE SURFACE RULES DECIDE HOW MUCH. Darkening it here
    first was the obvious move and it is wrong for exactly the colours worth
    having: amber mixed toward black is BROWN, and a card washed in brown reads
    as dirty rather than as lit. The mix belongs at the surface, against the tier
    the palette already chose, where a small share of a bright colour is a tint
    and a large share of a dark one is mud.
  */
  wash: (p) => `${p.lit}`,
  /*
    ⚠️ THE BAND COMES BACK SEPARATELY — see `Ground`. It is the one thing in a
    scene that moves, and it is out from under the dither because it is steep
    enough not to need it and because a layer under a blend cannot be composited
    on its own. Everything else here is a shallow ramp and stays where the grain
    can reach it.
  */
  ground: (p, r): Ground => ({
    flare: forms(r, p, (q) => `color-mix(in oklab, ${q.lit} 22%, #fff)`),
    layers: [
      bloom(r, p),
      /* ⚠️ THE CRUSH, so the corners are not as bright as the source. Without one
         a lit ground reads as filled rather than photographed. */
      `radial-gradient(${between(r, 110, 165)}% 120% at ${between(r, 20, 80)}% ${between(r, 4, 34)}%,`
        + ` transparent 24%, color-mix(in oklab, ${PITCH} 88%, #000) 100%)`,
      `linear-gradient(180deg, ${PITCH} 0%, color-mix(in oklab, ${PITCH} 70%, #000) 100%)`,
    ],
  }),
};

/**
 * ⚠️ ON PAPER A LIGHT IS THE HUE AND THE ROOM IS THE WHITE. Same geometry, same
 * bloom, same wash — only the core inverts, which is the one thing that cannot
 * be shared. The ground stays paper, so the band is a saturated stroke of the
 * app's colour across a white page rather than a grey smear.
 */
const DAY: Family = {
  id: "neon.day",
  slots: ["deep", "lit"],
  ink: "fixed",
  tile: { w: 1400, h: 1000 },
  veil: (p) => `color-mix(in oklab, ${p.lit} 6%, #fff)`,
  wash: (p) => `color-mix(in oklab, ${p.lit} 46%, #fff)`,
  ground: (p, r): Ground => ({
    flare: forms(r, p, (q) => `${q.lit}`),
    layers: [
      bloom(r, p),
      `radial-gradient(${between(r, 110, 165)}% 120% at ${between(r, 20, 80)}% ${between(r, 4, 34)}%,`
        + ` #fff 26%, color-mix(in oklab, ${p.lit} 12%, #fff) 100%)`,
      `linear-gradient(180deg, #fff 0%, color-mix(in oklab, ${p.lit} 7%, #fff) 100%)`,
    ],
  }),
};

export const NEON = { night: NIGHT, day: DAY } as const;
