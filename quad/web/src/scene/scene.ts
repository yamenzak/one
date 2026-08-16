/**
 * THE SCENE ENGINE — a ground is a COMPOSITION, not a gradient.
 *
 * ⚠️ THE WHOLE IDEA IN ONE SENTENCE: a FAMILY declares what a kind of world is
 * made of; a SEED decides which one you get; a few SETTINGS decide how loud it
 * is. Everything else — the twenty-four hand-written gradient stacks in
 * `ambience.ts` — is a world somebody drew once, and drawing the twenty-fifth is
 * the same afternoon again. A family drawn once yields every world in it.
 *
 * ⚠️ THE GRAMMAR IS BORROWED, AND FROM SOMETHING THAT ALREADY WORKS. DiceBear's
 * avatar styles are exactly this: components, each with weighted variants, over
 * named colour slots, with animation declared as a variant of its own. Millions
 * of distinct faces that are all recognisably one style, from one declaration.
 * A background has the same requirement — every workspace visibly its own, all
 * of them visibly the same product — so it gets the same machine rather than a
 * new one invented for it.
 *
 * ⚠️ SAME SEED, SAME WORLD, FOREVER. A scene is an IDENTITY: the workspace
 * somebody recognises by its sky must have that sky on every device and after
 * every deploy. `Math.random` appears nowhere in this directory and must not.
 *
 * ⚠️ DENSITY IS A SETTING, BECAUSE A GROUND COMPETES WITH WHAT IS ON IT. The
 * same family behind a screen with forty rows and behind a page that says
 * "nothing here" wants two different amounts of itself — and the version tuned
 * for one is wrong behind the other. That is not a per-screen gradient; it is
 * one number, and the family decides what it means.
 *
 * ⚠️ AND THE VIGNETTE IS A MASK, NOT A WASH. A ground that has to be covered to
 * be readable is a ground that is too loud, and the cover is a grey film over
 * somebody's brand. What a scene does instead is RECEDE where content sits: the
 * layer's own alpha drops, so the page's ground shows through and the world is
 * still visibly there at the edges. `scripts/scene.test.mjs` refuses the wash.
 */

import { TWINKLE } from "../tokens/motion.js";

/* ------------------------------------------------------------------ seeds --- */

/**
 * ⚠️ ONE PRNG FOR THE WHOLE ENGINE. Two would mean two worlds could be built
 * from one seed and disagree, which is the exact failure the seed exists to
 * prevent. `mulberry32`, as in `ambience.ts` — small, fast, well-distributed
 * enough for placement, and not cryptographic because nothing here is a secret.
 */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** ⚠️ FNV-1a. A string seed has to become a number somewhere, once. */
export const hash = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/**
 * SCATTER THAT LOOKS SCATTERED.
 *
 * ⚠️ UNIFORM RANDOM IS THE WRONG DISTRIBUTION AND IT IS THE MISTAKE EVERY STAR
 * FIELD MAKES ONCE. Independent x and y produce clumps and bald patches — the
 * eye reads both as structure, so a field meant to be even reads as a pattern
 * with mistakes in it. What is wanted is BLUE NOISE: even coverage, no lattice.
 *
 * ⚠️ A JITTERED GRID IS BLUE NOISE FOR FREE. Divide the canvas into cells, put
 * one point somewhere inside each — evenness comes from the cells, irregularity
 * from the offset, and it costs one pass instead of the rejection sampling a
 * true Poisson disc needs. The jitter is deliberately less than a whole cell:
 * at full jitter two neighbours can land touching, which is the clumping this
 * exists to remove.
 */
export function scatter(
  r: () => number, width: number, height: number, count: number, jitter = 0.82,
): readonly (readonly [number, number])[] {
  if (count <= 0) return [];
  /* ⚠️ Cells as square as the canvas allows, so the spacing is even in both
     directions — a grid of tall cells makes a field that reads as rows. */
  const cols = Math.max(1, Math.round(Math.sqrt((count * width) / height)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const cw = width / cols;
  const ch = height / rows;
  const out: (readonly [number, number])[] = [];
  for (let i = 0; i < count; i += 1) {
    const cx = i % cols;
    const cy = Math.floor(i / cols) % rows;
    const dx = (0.5 + (r() - 0.5) * jitter) * cw;
    const dy = (0.5 + (r() - 0.5) * jitter) * ch;
    out.push([+(cx * cw + dx).toFixed(1), +(cy * ch + dy).toFixed(1)]);
  }
  return out;
}

/** ⚠️ Weighted, so a family's own ratios are the ratios — see `Speck`. */
export function pick<T extends { readonly weight: number }>(r: () => number, from: readonly T[]): T {
  const total = from.reduce((n, v) => n + v.weight, 0);
  let at = r() * total;
  for (const v of from) { at -= v.weight; if (at <= 0) return v; }
  return from[from.length - 1]!;
}

/* ---------------------------------------------------------------- declare --- */

/**
 * ⚠️ NAMED SLOTS, NOT COLOURS. A family says it needs a `deep` and a `lit`; what
 * fills them is the scene's business — a planet's own two colours, a workspace's
 * brand, a status tone. That indirection is what lets one family be every
 * workspace's world instead of one workspace's.
 */
export type Palette = Readonly<Record<string, string>>;

export interface Variant {
  /** ⚠️ Relative, never a percentage. A family's ratios stay readable. */
  readonly weight: number;
  /** Draws ONE, at the origin. The sampler decides where. */
  readonly draw: (p: Palette, r: () => number) => string;
  /**
   * ⚠️ WHICH BEAT, AND WHAT SHARE OF THEM KEEP IT. "Everything animates" is the
   * effect everybody builds once: a field where every mark moves is a field
   * nobody can read over, and the movement stops reading as life and starts
   * reading as noise. A variant that MAY move says so, and says how many of it
   * actually do.
   */
  readonly beat?: keyof typeof TWINKLE;
  /** 0..1. Absent means none of them. */
  readonly moving?: number;
}

export interface Speck {
  readonly id: string;
  /**
   * ⚠️ PER MEGAPIXEL AT DENSITY 1, NOT A COUNT. A count is right for one canvas
   * size and wrong for every other — the same field would be sparse on a desktop
   * and crowded on a phone. An area rate is the same world at any size.
   */
  readonly per: number;
  readonly variants: readonly Variant[];
}

export interface Family {
  readonly id: string;
  /** What a palette has to fill for this family to be drawable. */
  readonly slots: readonly string[];
  /**
   * ⚠️ THE GROUND IS THE FAMILY'S TOO. A world is not marks on the page's own
   * background — it is a whole environment, and its own field is the part that
   * makes it one. CSS layers, topmost first, exactly as `background-image` reads.
   */
  readonly ground: (p: Palette, r: () => number) => readonly string[];
  readonly specks?: readonly Speck[];
  /** ⚠️ The canvas the specks are drawn on and TILED at — see `render`. */
  readonly tile?: { readonly w: number; readonly h: number };
  /**
   * ⚠️ THE ONE COLOUR TYPE SITS AGAINST, AND IT EXISTS SO NOBODY EVER PUTS A
   * SCRIM UNDER A HEADING. Words laid directly on a world are the one place a
   * scene can lose: a title crossing the lit limb of a planet has the same value
   * on both sides of every stroke, and the honest-looking fix — a dark plate
   * behind the words — is wider than the subject and reads as two patches of
   * grime either side of it. What actually works is a HALO in the ground's own
   * colour, which is invisible as a shape and doubles the contrast at every
   * edge. The family is the only thing that knows that colour: `ground` is a
   * list of gradients, and nothing downstream can read a value out of it.
   *
   * ⚠️ AND IT IS PER SKY, NOT PER SCENE. A night's veil is near its deep and a
   * day's is near paper — the same halo under both would outline the letters on
   * one of them. That is exactly the decision a family variant exists to hold.
   */
  readonly veil?: (p: Palette) => string;
}

export interface Scene {
  readonly family: Family;
  /** ⚠️ An identity, never a label — the same rule faces follow. */
  readonly seed: string;
  readonly palette: Palette;
  /**
   * ⚠️ 1 IS THE FAMILY'S OWN IDEA OF NORMAL. Below it a screen with a lot on it
   * gets its world back without being competed with; above it an almost-empty
   * page gets one worth looking at. A screen names an intent, not a number —
   * see `DENSITY`.
   */
  readonly density?: number;
  readonly motion?: boolean;
}

/**
 * ⚠️ THREE NAMES, BECAUSE A NUMBER AT A CALL SITE IS A NUMBER SOMEBODY TUNED FOR
 * THEIR SCREEN. What a screen knows is how much of itself is content; what that
 * means in stars is the engine's.
 */
export const DENSITY = {
  /** A screen with rows, tables, a form. The world is present, not busy. */
  quiet: 0.45,
  /** The default: a detail page, a hub, a settings surface. */
  even: 1,
  /** An arrival, an empty state, a door — nothing competing. */
  rich: 1.8,
} as const;

export type Density = keyof typeof DENSITY;

/* ----------------------------------------------------------------- render --- */

/**
 * ⚠️ THE SPECKS BECOME ONE TILED SVG, NOT ELEMENTS IN THE PAGE. Two hundred
 * nodes in the DOM is two hundred things the browser lays out, styles and
 * repaints; the same two hundred inside one background image is a texture the
 * compositor uploads once. It is also why the motion has to live INSIDE the
 * picture — see `beats`.
 */
export function render(scene: Scene): {
  readonly art: string;
  readonly ground: string;
  /** ⚠️ Empty where the family declares none — see `Family.veil`. */
  readonly veil: string;
} {
  const { family, palette } = scene;
  const moving = scene.motion !== false;
  const density = scene.density ?? 1;
  const r = prng(hash(`${family.id}|${scene.seed}`));

  const tile = family.tile ?? { w: 1400, h: 1000 };
  const megapixels = (tile.w * tile.h) / 1_000_000;

  const marks: string[] = [];
  const beats = new Set<keyof typeof TWINKLE>();

  for (const speck of family.specks ?? []) {
    const count = Math.round(speck.per * megapixels * density);
    for (const [x, y] of scatter(r, tile.w, tile.h, count)) {
      const v = pick(r, speck.variants);
      /* ⚠️ THE SHARE IS DRAWN PER INSTANCE, from the same stream, so which marks
         move is part of the world rather than a second decision. */
      const beat = moving && v.beat && r() < (v.moving ?? 0) ? v.beat : null;
      if (beat) beats.add(beat);
      const body = v.draw(palette, r);
      marks.push(beat
        ? `<g class="b-${beat}" transform="translate(${x} ${y})">${body}</g>`
        : `<g transform="translate(${x} ${y})">${body}</g>`);
    }
  }

  /*
    ⚠️ THE MOTION IS A `<style>` INSIDE THE PICTURE, AND THIS IS THE ENGINE'S
    MOST USEFUL PROPERTY. It travels with the image, so the same file is correct
    as a background, as an `<img>` and in a document that has never heard of our
    stylesheet; it needs no keyframe registered anywhere; and its own
    `prefers-reduced-motion` guard means the operating system's answer is honoured
    without a rule from us. Only the beats actually used are emitted.

    ⚠️ AND IT IS `opacity` ONLY. Opacity and transform are the two properties a
    compositor can animate without touching layout or paint — anything else on a
    layer this size is a full-viewport repaint every frame, forever, on a phone.
  */
  const motion = beats.size
    ? `<style>@media (prefers-reduced-motion: no-preference){`
      + `@keyframes qb{0%,100%{opacity:1}50%{opacity:.3}}`
      + [...beats].map((b) =>
        `.b-${b}{animation:qb ${TWINKLE[b].period} ease-in-out infinite ${TWINKLE[b].delay}}`).join("")
      + `}</style>`
    : "";

  const art = marks.length
    ? `url("data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${tile.w}" height="${tile.h}"`
      + ` viewBox="0 0 ${tile.w} ${tile.h}">${motion}${marks.join("")}</svg>`)}")`
    : "none";

  return {
    art,
    ground: family.ground(palette, prng(hash(`${family.id}|ground|${scene.seed}`))).join(", "),
    veil: family.veil?.(palette) ?? "",
  };
}
