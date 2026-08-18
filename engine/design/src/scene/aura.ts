/**
 * AURA — the second family, and the proof that the engine is a machine rather
 * than a place `space` happens to live.
 *
 * ⚠️ IT HAD TO BE DIFFERENT IN KIND, NOT IN COLOUR. The cheap second family is
 * space with another palette, and it would prove nothing: the point of a family
 * is that two of them are two WORLDS. So every decision here is the opposite of
 * the one `space` makes.
 *
 *   SPACE is a landscape — light at the horizon, deep overhead, a base that
 *   runs top to bottom, and hundreds of tiny sharp marks.
 *   AURA is an atmosphere — light in the MIDDLE falling away in every
 *   direction, a base that is radial rather than linear, and a dozen enormous
 *   soft blooms.
 *
 * ⚠️ AND IT IS A PERSON'S, WHICH IS WHY IT IS SHAPED THAT WAY. A workspace is a
 * world you look AT from outside; that is what a planet on a starfield is. A
 * person is not a place you visit — the light is theirs and you are standing in
 * it. One is a view, the other is a room, and the two grounds say so before a
 * word is read.
 *
 * ⚠️ THE SLOTS ARE `deep` AND `lit`, THE SAME TWO SPACE ASKS FOR. Not a
 * coincidence and not laziness: both are read out of a DiceBear style's own
 * palette (`worldFor`), and a family that invented a third slot would be a
 * family nothing in this product could fill. Two colours is what an identity
 * actually carries.
 */

import type { Family, Palette } from "./scene.js";

/**
 * ⚠️ A BLOOM IS A GRADIENT, AND THAT IS THE WHOLE REASON `Family.defs` EXISTS. A
 * filled circle at 8% alpha two hundred pixels wide is a visible DISC — the eye
 * finds a hard edge at any opacity, and at this size there is nothing else on
 * the screen for it to find. Softness is not a strength setting; it is a
 * different mark.
 *
 * ⚠️ THREE STOPS, BECAUSE TWO IS A BALL. A linear falloff from centre to nothing
 * reads as a sphere lit from the front — which is a lovely mark and the wrong
 * one, because there are already planets in this product. Holding most of the
 * value until past halfway and then dropping makes a soft-edged CLOUD.
 */
const bloom = (id: string, colour: string) =>
  `<radialGradient id="${id}">`
  + `<stop offset="0" stop-color="${colour}"/>`
  + `<stop offset=".52" stop-color="${colour}" stop-opacity=".42"/>`
  + `<stop offset="1" stop-color="${colour}" stop-opacity="0"/>`
  + `</radialGradient>`;

/**
 * ⚠️ A LIGHT IS NOT A HUE, AND THIS FAMILY IS WHERE IGNORING THAT SHOWS WORST.
 * `moods` picks its faces from twelve saturated colours — a yellow, a lime, a
 * rose — and mixing one of those straight into a dark teal ground gives KHAKI.
 * It was built that way first and the whole upper half of the page was mud: not
 * a strength problem, a chroma problem, and no opacity fixes one.
 *
 * ⚠️ A REAL SOURCE GOES TOWARD WHITE AS IT BRIGHTENS, because the sensor runs
 * out of range before the light does. So what lights a night aura is the
 * person's colour taken most of the way to white — a warm white, with their hue
 * surviving in the falloff. Same argument as `hot` in `ambience.ts`, arriving
 * for the second time because it is about physics rather than about that file.
 */
const glow = (p: Palette) => `color-mix(in oklab, ${p.lit} 44%, #fff)`;

/**
 * ⚠️ THREE MARKS ACROSS TWO SKIES, AND EACH SKY SHIPS ONLY ITS OWN. `l` is the
 * whitened light and only night can use it — on paper a near-white cloud is
 * nothing at all. `w` is the person's raw colour, a warm patch on white and a
 * yellow smear on black. `d` is their deep, the only one that gives a daylight
 * room its shape.
 *
 * ⚠️ ONE SHARED `defs` WAS WRITTEN FIRST AND THE CONFORMANCE TEST REFUSED IT
 * IMMEDIATELY, which is the whole reason that test renders rather than reads.
 * Emitting all three per sky is bytes in a data URI on every cold load for a
 * gradient nothing in that picture references — invisible, harmless, and the
 * exact shape of a rename that left half of itself behind.
 */
const NIGHT_DEFS = (p: Palette) => bloom("l", glow(p));
const DAY_DEFS = (p: Palette) => `${bloom("w", p.lit!)}${bloom("d", p.deep!)}`;

/** ⚠️ `opacity` on the mark, never a second alpha inside the gradient — one
    knob per mark, or a family's own ratios stop meaning anything. */
const cloud = (of: "l" | "w" | "d", r: number, a: number) => () =>
  `<circle r="${r}" fill="url(#${of})" opacity="${a}"/>`;

/**
 * ⚠️ SEVEN PER MEGAPIXEL AGAINST A SKY'S ONE HUNDRED AND NINETY, and the ratio
 * is the family. A tile holds about ten of these at `even` and eighteen at
 * `rich` — few enough that each one is a place the light is, rather than a
 * texture. Raise the count and the blooms overlap into an even wash, which is
 * the single most common way this kind of ground fails.
 *
 * ⚠️ AND THEY MOVE MORE OFTEN THAN STARS DO, WHICH IS ONLY A CONTRADICTION IF
 * THE DIP IS IGNORED. A third of the stars twinkle because a twinkle is a mark
 * going most of the way out; two thirds of these breathe because a breath is a
 * fifth of a stop over nineteen seconds. What must never happen is a field where
 * the MOVEMENT is what you notice — the same rule, arriving at a different
 * number because the mark is different. See `BEAT`.
 */
const CLOUDS = {
  id: "cloud",
  per: 7,
  variants: [
    { weight: 3, draw: cloud("l", 96, 0.2), beat: "breathe" as const, moving: 0.66 },
    { weight: 3, draw: cloud("l", 150, 0.14), beat: "swell" as const, moving: 0.6 },
    { weight: 2, draw: cloud("l", 232, 0.09), beat: "swell" as const, moving: 0.4 },
    { weight: 1, draw: cloud("l", 58, 0.28), beat: "breathe" as const, moving: 0.7 },
  ],
} as const;

/**
 * ⚠️ DAY LEADS WITH THE DEEP, WHICH IS THE MIRROR OF NIGHT AND NOT A TINT OF IT.
 * On paper a pale bloom is invisible and the shape has to come from the darker
 * of the two colours; on near-black it is the other way round. Same family, same
 * marks, the palette's two colours swapping which one does the work.
 */
const HAZE = {
  id: "haze",
  per: 6,
  variants: [
    { weight: 3, draw: cloud("d", 158, 0.11), beat: "swell" as const, moving: 0.55 },
    { weight: 2, draw: cloud("w", 196, 0.2), beat: "breathe" as const, moving: 0.6 },
    { weight: 1, draw: cloud("d", 76, 0.15), beat: "breathe" as const, moving: 0.66 },
  ],
} as const;

/**
 * ⚠️ THE BASE IS RADIAL, AND IT IS THE ONE LAYER THAT MAKES THIS NOT A SKY. A
 * linear base has a top and a bottom, so whatever is drawn over it reads as
 * being somewhere in a landscape. A base that darkens outward from a point has
 * no horizon at all — the page is a volume with the subject in the middle of it,
 * and every bloom over it reads as being IN the room rather than above it.
 *
 * ⚠️ AND THE CENTRE SITS HIGH, at 30%, because that is where the subject is on
 * every screen this ground is under: a face, then their address, then a list.
 * Centred vertically it lights the list and leaves the person in the dark, which
 * is exactly backwards and was visible in one frame.
 */
const NIGHT: Family = {
  id: "aura.night",
  slots: ["deep", "lit"],
  tile: { w: 1400, h: 1000 },
  specks: [CLOUDS],
  defs: NIGHT_DEFS,
  veil: (p) => `color-mix(in oklab, ${p.deep} 74%, #000)`,
  ground: (p) => [
    `radial-gradient(56% 42% at 76% 30%, color-mix(in oklab, ${glow(p)} 12%, transparent) 0%, transparent 74%)`,
    `radial-gradient(52% 40% at 20% 66%, color-mix(in oklab, ${glow(p)} 8%, transparent) 0%, transparent 76%)`,
    `radial-gradient(90% 62% at 50% 22%, color-mix(in oklab, ${glow(p)} 19%, transparent) 0%, transparent 78%)`,
    `radial-gradient(150% 118% at 50% 30%, ${p.deep} 0%,`
      + ` color-mix(in oklab, ${p.deep} 44%, #000) 60%,`
      + ` color-mix(in oklab, ${p.deep} 22%, #000) 100%)`,
  ],
};

/**
 * ⚠️ DAY IS THE SAME ROOM WITH THE LIGHT ON, NOT NIGHT LIGHTENED. The centre is
 * paper and the EDGES carry the colour — the inverse of the night base, because
 * on a light ground the way to say "the light is here" is to take the tint away
 * rather than add one. Reaching for this by turning the night base's opacity
 * down produces grey, every time, which is the fault the whole two-sky idea
 * exists to answer.
 */
const DAY: Family = {
  id: "aura.day",
  slots: ["deep", "lit"],
  tile: { w: 1400, h: 1000 },
  specks: [HAZE],
  defs: DAY_DEFS,
  veil: (p) => `color-mix(in oklab, ${p.deep} 12%, #fff)`,
  ground: (p) => [
    /* ⚠️ THE WARM IS A QUARTER AND NOT A HALF. At 40% the person's own yellow
       covered the top third of the page and read as a stain rather than as
       light — the same over-reach the day sky made, one family later. */
    `radial-gradient(56% 42% at 74% 28%, color-mix(in oklab, ${p.lit} 22%, #fff) 0%, transparent 72%)`,
    `radial-gradient(56% 44% at 20% 66%, color-mix(in oklab, ${p.deep} 9%, transparent) 0%, transparent 78%)`,
    /* ⚠️ THE LIGHT ITSELF IS WHITE HERE. On paper "brighter" is the absence of
       tint, so the centre takes the colour AWAY rather than adding any. */
    `radial-gradient(94% 66% at 50% 22%, #fff 0%, transparent 70%)`,
    `radial-gradient(150% 118% at 50% 30%, color-mix(in oklab, ${p.deep} 4%, #fff) 0%,`
      + ` color-mix(in oklab, ${p.deep} 15%, #fff) 58%,`
      + ` color-mix(in oklab, ${p.deep} 27%, #fff) 100%)`,
  ],
};

/** ⚠️ One family, two skies. The theme picks — see `worldCss`. */
export const AURA = { night: NIGHT, day: DAY } as const;
