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

import { BEAT, TURN, TURN_AT, EASE_SPLINE, turns } from "../tokens/motion.js";

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

/**
 * A GROUND, AND THE PART OF IT THAT IS THE SOURCE.
 *
 * ⚠️ MOST FAMILIES RETURN AN ARRAY AND ARE DONE — the whole world is one stack
 * of gradients under the dither, which is where a world belongs: the grain is
 * what stops a large smooth ramp banding on an 8-bit display, and every family
 * whose light is a haze needs it.
 *
 * ⚠️ A HARD SOURCE IS THE EXCEPTION, AND IT IS THE ONLY THING IN A SCENE THAT
 * MAY MOVE. It is steep — a thin bright band with no shallow ramp in it — so it
 * has nothing to band and does not need the dither; and being out from under a
 * `mix-blend-mode` layer is what lets it animate on its own compositor layer
 * instead of dragging the whole viewport-sized stack onto the main thread every
 * frame, which is what killed the ground's old drift.
 *
 * ⚠️ SO THE SPLIT IS THE FAMILY'S, NOT A RULE'S. Nothing downstream can tell a
 * band from a bloom by looking at a gradient string, and a stylesheet that
 * guessed would lift the wrong layer on the next family somebody writes.
 */
export interface Ground {
  /** Behind everything, under the dither. */
  readonly layers: readonly string[];
  /** ⚠️ The source itself, above the dither — see the header. */
  readonly flare?: readonly string[];
}

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
  readonly beat?: keyof typeof BEAT;
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

/**
 * MARKS ON AN EXACT GRID, WHICH IS A DIFFERENT PRIMITIVE FROM A SCATTER.
 *
 * ⚠️ A SCATTER CANNOT MAKE A PATTERN, AND THAT IS THE WHOLE REASON THIS EXISTS.
 * `scatter` jitters on purpose — evenness from the cells, irregularity from the
 * offset — which is exactly right for stars and destroys anything whose marks
 * have to MEET. A truchet is one tile in four rotations whose curves run off the
 * edges into its neighbours: shift a tile by three pixels and every line in the
 * field ends in mid-air. Adjacency is the mark.
 *
 * ⚠️ A TILE DRAWS IN THE UNIT SQUARE and the engine scales it. That way the
 * geometry survives the cell size changing with density — one declaration, every
 * scale — and a stroke width is a fraction of the cell rather than a number
 * somebody tuned at one zoom.
 *
 * ⚠️ AND DENSITY RESIZES THE CELL, NOT A COUNT. A lattice has no count: it fills
 * what it is given. `quiet` makes the cells larger and the pattern calmer, which
 * is the same intent arriving through the only knob a grid has.
 */
export interface Tiles {
  readonly id: string;
  /** The cell edge in tile units at density 1. */
  readonly cell: number;
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
  readonly ground: (p: Palette, r: () => number) => readonly string[] | Ground;
  readonly specks?: readonly Speck[];
  /** ⚠️ Marks that must MEET — see `Tiles`. A family has these or specks. */
  readonly tiles?: readonly Tiles[];
  /**
   * ONE COMPOSITION SIZED TO THE WHOLE TILE — the third and last way to make a
   * field.
   *
   * ⚠️ A SWEPT LINE FIELD IS NEITHER SCATTERED NOR LAID. Its marks are lines
   * that cross the entire frame: where each one goes depends on where the ones
   * around it went, so no per-mark placement can produce it. `scatter` would
   * give a heap of disconnected arcs and a lattice would chop every line into
   * cells. What is left is to draw the whole thing at once.
   *
   * ⚠️ AND IT MUST TILE BY CONSTRUCTION, WHICH IS A REAL CONSTRAINT ON THE MATH
   * RATHER THAN A NOTE. The field repeats at the tile, so a curve whose value at
   * `x = 0` differs from its value at `x = w` shows a vertical crack down every
   * repeat — one pixel wide, perfectly straight, the single most visible thing
   * on a quiet ground. A composition that uses only whole numbers of cycles
   * across the tile cannot have one.
   */
  readonly drawn?: (p: Palette, r: () => number, tile: {
    readonly w: number; readonly h: number;
  }) => string;
  /**
   * ⚠️ The canvas the marks are drawn on and TILED at, in CSS pixels — see
   * `render`. A lattice ROUNDS it to a whole number of cells, because a pattern
   * whose repeat cuts a cell in half has a visible seam every tile.
   */
  readonly tile?: { readonly w: number; readonly h: number };
  /**
   * WHERE A MARK'S COLOUR COMES FROM, AND IT IS A PROMISE RATHER THAN A STYLE.
   *
   * ⚠️ `fixed` MEANS THE MARKS ARE ACHROMATIC AND THE PALETTE MAY BE CSS
   * CUSTOM PROPERTIES. That matters because a world's two colours come from two
   * different places: a workspace and a person have a PICTURE to read them out
   * of, while a product and the deployment have only the theme — and `var(--brand)`
   * inside an SVG is a string, not a colour. It resolves to nothing, the mark is
   * painted with nothing, and the field is simply absent with no error anywhere.
   * A `fixed` family draws in white or black and lets the GROUND carry the hue,
   * which is what makes it usable from a brand.
   */
  readonly ink?: "palette" | "fixed";
  /**
   * ⚠️ WHAT THE MARKS SHARE, EMITTED ONCE. A star is a filled circle and needs
   * nothing; a BLOOM is soft-edged, and the only way to draw a soft edge in SVG
   * is a gradient — which lives in `<defs>` and is referenced by id. Without a
   * place to put it, a family either ships a `<defs>` inside every mark (the
   * same twelve lines repeated two hundred times, in a stylesheet, on every cold
   * load) or fakes the softness with concentric rings, which bands.
   *
   * ⚠️ IDS ARE SAFE HERE, WHICH THEY ARE NOT IN A PAGE. Each scene is its own
   * SVG document inside its own data URI, so `#m` in one tile cannot be reached
   * by another — the collision this would normally cause is structurally absent.
   */
  readonly defs?: (p: Palette) => string;
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
  /**
   * WHAT THE LIGHT LANDS ON, WHICH IS NOT THE SAME QUESTION AS WHAT TYPE SITS
   * AGAINST.
   *
   * ⚠️ A GROUND IS BEHIND THE PAGE AND THE CONTROLS ARE ON TOP OF IT, so a world
   * with no answer here is wallpaper hung behind a working screen: the pill, the
   * card and the bar stay the grey the palette made them whatever is going on
   * two layers down. `veil` cannot do this job — it is the ground's own colour,
   * deliberately near the page so a halo is invisible and a hem reads as the
   * page thickening, and a control made of it is a control nobody can find.
   *
   * ⚠️ SO IT IS A SECOND, LOUDER COLOUR, AND THE FAMILY IS THE ONLY THING THAT
   * KNOWS IT. `ground` is a list of gradients and nothing downstream can read a
   * value out of one. Published as `--scene-wash`, mixed into the surface tiers
   * by ONE rule in `ambienceStylesheet` — never by a component, which is what
   * keeps "an app writes no colour" true while the world still reaches the
   * things standing in it.
   *
   * ⚠️ AND A FAMILY WITH NO WASH IS THE DEFAULT. Most worlds are quiet on
   * purpose; the surfaces stay the palette's, and the token falls back.
   */
  readonly wash?: (p: Palette) => string;
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
  /**
   * ⚠️ WHETHER THE MARKS BEAT AT ALL, DECIDED BY THE CALLER AND NOT BY A MEDIA
   * QUERY. A beat is SMIL, because SMIL is the only thing that repaints inside a
   * `<pattern>` — and SMIL cannot be switched off by CSS. So the two signals a
   * person can give are read where React can see them (`useScenery`) and the
   * animation is simply not emitted. A picture that never moves is the correct
   * answer to "less motion", and it costs less than one that does.
   */
  readonly still?: boolean;
}

/**
 * ⚠️ THREE NAMES, BECAUSE A NUMBER AT A CALL SITE IS A NUMBER SOMEBODY TUNED FOR
 * THEIR SCREEN. What a screen knows is how much of itself is content; what that
 * means in stars is the engine's.
 */
export const DENSITY = {
  /** A screen with rows, tables, a form. The world is present, not busy. */
  quiet: 0.45,
  /** The default: a detail page, a OneSpace, a settings surface. */
  even: 1,
  /** An arrival, an empty state, a door — nothing competing. */
  rich: 1.8,
} as const;

export type Density = keyof typeof DENSITY;

/**
 * THE MOST NODES A FIELD MAY EVER EMIT.
 *
 * ⚠️ DENSITY IS AN INTENT AND THIS IS A CEILING, WHICH IS WHY THERE ARE BOTH. A
 * screen says how present it wants its world to be; what that costs is the
 * engine's problem, and a family whose idea of "present" is a fine weave over a
 * 1400 × 1000 tile spends thousands of nodes to say it. `quiet` is the worst
 * case rather than the cheapest — a lattice fills what it is given, so asking for
 * LESS of the family makes the cells smaller and there are more of them.
 *
 * ⚠️ 600 IS WHERE THE STRING STOPS BEING THE PICTURE'S COST AND STARTS BEING THE
 * PAGE'S. Measured, one family at a time, at the density a list screen asks for:
 * the fine lattice unbounded is 2,820 placements and 504 KB of markup, which the
 * browser parses in full before it can paint anything; at this ceiling it is 588
 * and 133 KB. Every other family is already under it and is untouched.
 *
 * ⚠️ AND NOTHING ABOUT THE WORLD READS DIFFERENTLY AT THE CEILING. The tile
 * repeats sooner — a symmetry somebody might find on a wide screen — against
 * half a megabyte on every screen including the phone.
 */
export const MARKS = 600;

/* ----------------------------------------------------------------- render --- */

/**
 * ⚠️ ONE TILE, LAID BY A `<pattern>` IN A LIVE `<svg>` — NOT A BACKGROUND IMAGE,
 * AND THIS IS THE MOST IMPORTANT SENTENCE IN THE FILE. The field was a
 * `background-image: url("data:image/svg+xml,…")` carrying its own `<style>`,
 * and the argument for it was good: the motion travels with the picture, needs
 * no keyframe registered anywhere, and answers `prefers-reduced-motion` by
 * itself. The argument was also wrong, because **Chromium renders an SVG used as
 * `background-image` STATICALLY.** Measured: the same file animates as an
 * `<img>` and does not animate as a background, so every star in this product
 * had been still since the day the field was written — with a guard checking the
 * keyframes were compositor-only, a test checking the still bake differed, and
 * nothing anywhere checking that anything moved.
 *
 * ⚠️ SO THE FIELD IS AN ELEMENT AND THE BEATS ARE THE STYLESHEET'S. Inline SVG
 * animates in every form (measured: plain, `<pattern>`, `<use>`, and a rotation
 * inside a pattern), and a live element is reached by the page's own CSS — so
 * `ambienceStylesheet` defines the beats once and a mark just carries the class.
 * That also deletes the two-bake requirement: switching motion off used to mean
 * rendering a second picture, and it is now the rule not applying.
 *
 * ⚠️ THE MARKS STILL LIVE INSIDE ONE ELEMENT rather than as two hundred nodes in
 * the page. A `<pattern>` is a paint server: the browser lays out one `<svg>` and
 * one `<rect>`, whatever the field contains.
 */
export interface Rendered {
  /**
   * The `<svg>`'s children: a `<pattern>` holding the marks, and a `<rect>`
   * filled with it. Engine-generated, so it is safe to set as inner HTML.
   */
  readonly field: string;
  /** CSS `background-image` layers, topmost first. */
  readonly ground: string;
  /** ⚠️ Empty where the family declares none — see `Family.veil`. */
  readonly veil: string;
  /** ⚠️ Empty where the family declares none — see `Family.wash`. */
  readonly wash: string;
  /** ⚠️ Empty for every family whose light is a haze — see `Ground`. */
  readonly flare: string;
}

/* ------------------------------------------------------------------ depth --- */

/**
 * HOW DEEP A NIGHT IS — added by the ENGINE, under whatever the family drew.
 *
 * ⚠️ THE DARK GROUNDS WERE FLAT, AND THE NUMBER SAYS SO. Measured across all
 * nine families with `litness`, in OKLab L over a whole 900×700 screen: the
 * night grounds spanned 0.064 to 0.151 from their first percentile to their
 * ninety-ninth, and their median sat almost exactly HALFWAY between the two.
 * That is the histogram of a wash — an even field with a slight bias — and it is
 * why a dark screen here reads as "grey page" rather than as a lit room. `tint`
 * was the one exception at 0.370, and `tint` is the one family anybody described
 * as looking expensive.
 *
 * ⚠️ WHAT A LIT SCENE ACTUALLY HAS IS A BOTTOM-WEIGHTED HISTOGRAM WITH A TAIL.
 * Most of the frame near the floor, a small region much brighter, and a smooth
 * ramp between them. The families already draw the tail — three poles and a
 * crush is a source. What none of them drew was enough FLOOR for the source to
 * be brighter than, so the whole picture floated in the middle.
 *
 * ⚠️ SO THIS IS ONE STAGE IN THE COMPOSER RATHER THAN NINE EDITS. "How dark is
 * the dark" is a property of the SYSTEM — the thing D85 calls the material —
 * and nine families each tuning their own floor is nine answers that agree until
 * somebody edits one. A family declares what a world is MADE of; how deep its
 * night goes is the engine's.
 *
 * ⚠️ AND IT IS SEEDED, SO IT IS NOT A FILTER OVER EVERYTHING. The centre and the
 * reach vary per world within a range approved once — the same property that
 * makes the families endless and governed at the same time. A fixed vignette on
 * every screen is the "one afternoon, applied forever" this directory replaced.
 *
 * ⚠️ DAY IS UNTOUCHED, AND THAT IS NOT AN OVERSIGHT. On paper the light is the
 * ABSENCE of tint (see `glow.ts`) — a crush added to a white ground is a grey
 * ring, which is the one thing a bright room never has. The measured light
 * spreads are already 0.061–0.153 and they read correctly.
 */
const NIGHT = /\.night$/;

/** ⚠️ How far the deep reaches in, as a share of the frame. Wide, because a
    vignette that starts at the edge reads as a frame rather than as falloff. */
const REACH = { near: 10, far: 22 } as const;

/** ⚠️ How black the corner gets. Below 0.4 nothing changed; above 0.7 the
    corners read as a hole punched in the page rather than as distance. */
const DEEP = { least: 0.55, most: 0.72 } as const;

const depth = (family: Family, seed: string): readonly string[] => {
  if (!NIGHT.test(family.id)) return [];
  const r = prng(hash(`${family.id}|depth|${seed}`));
  const pick = (lo: number, hi: number) => +(lo + r() * (hi - lo)).toFixed(2);
  /*
    ⚠️ AN ELLIPSE OFF CENTRE, BECAUSE A CENTRED ONE IS A LENS AND THIS IS A ROOM.
    Perfectly centred it reads as a photograph's vignette — a property of the
    camera — and what is wanted is the corner of a space being further from the
    light than the middle of it.

    ⚠️ AND IT IS `rgb(0 0 0 / …)` RATHER THAN A MIX WITH THE PALETTE. Every other
    layer here is made OF the world's colours; this one is the absence of light,
    which is the same in every world and must not pick up a hue — a tinted crush
    is a coloured shadow, and a coloured shadow is the single most reliable tell
    of a synthetic render.
  */
  return [
    `radial-gradient(${pick(96, 132)}% ${pick(86, 118)}%`
    + ` at ${pick(34, 66)}% ${pick(28, 52)}%,`
    + ` rgb(0 0 0 / 0) ${pick(REACH.near, REACH.far)}%,`
    + ` rgb(0 0 0 / ${pick(DEEP.least, DEEP.most)}) 100%)`,
  ];
};

export function render(scene: Scene): Rendered {
  const { family, palette } = scene;
  const density = scene.density ?? 1;
  const still = scene.still === true;
  const r = prng(hash(`${family.id}|${scene.seed}`));

  const want = family.tile ?? { w: 1400, h: 1000 };

  const marks: string[] = [];

  /*
    ⚠️ THE BEAT IS SMIL, AND IT IS THE ONLY THING THAT ANIMATES INSIDE A PATTERN.
    Measured three ways: a CSS keyframe on a `<g>` inside a `<pattern>` never
    repaints — Chromium rasterises the tile once and paints the cache, so the
    animation is created, `getAnimations()` reports it, and the picture is
    byte-identical a second later. `<animate>` and `<animateTransform>` in the
    same place both repaint. That is the whole reason this is not CSS.

    ⚠️ AND THE ANSWER BEFORE THIS ONE MADE THE FIELD PULSE. Splitting the marks
    into one layer per beat put the animation on a rendered `<rect>`, which does
    run — and fades a FIFTH OF THE SKY AT ONCE. Reported as "the ambience
    flickers", correctly: a beat is a mark breathing, and a beat applied to
    everything wearing it at the same time is the page throbbing.

    ⚠️ SO REDUCED MOTION IS DECIDED HERE, AT RENDER, RATHER THAN IN A MEDIA
    QUERY. SMIL cannot be switched off by CSS — which is the price — so `still`
    is read from both signals by the caller and the elements are simply not
    emitted. `useScenery` re-renders when either changes.

    ⚠️ THE BEAT GETS ITS OWN `<g>`, NESTED INSIDE THE PLACEMENT. In SVG the
    `transform` attribute is one value, so a turn animating it would REPLACE the
    translate that put the mark where it belongs — every turning tile would snap
    to the origin and orbit it. Two elements, one for where it is and one for
    what it does.
  */
  const placed = (at: string, beat: keyof typeof BEAT | null, body: string) => {
    if (!beat || still) return `<g transform="${at}">${body}</g>`;
    const b = BEAT[beat];
    /* ⚠️ A NEGATIVE OFFSET, SO A MARK IS PART-WAY THROUGH RATHER THAN WAITING.
       A positive `begin` holds every mark at rest for its whole delay after the
       page loads, which is most of the time anybody spends on a screen. */
    const begin = `-${b.delay}`;
    return `<g transform="${at}"><g>${
      turns(beat)
        ? `<animateTransform attributeName="transform" type="rotate" additive="sum"`
          + ` values="${TURN}" keyTimes="${TURN_AT}" dur="${b.period}" begin="${begin}"`
          + ` repeatCount="indefinite" calcMode="spline"`
          + ` keySplines="${EASE_SPLINE.repeat(TURN.split(";").length - 1).trim()}"/>`
        : `<animate attributeName="opacity" values="1;${(b as { dip: number }).dip};1"`
          + ` dur="${b.period}" begin="${begin}" repeatCount="indefinite"`
          + ` calcMode="spline" keySplines="${EASE_SPLINE}${EASE_SPLINE.trim()}"/>`
    }${body}</g></g>`;
  };

  /* ⚠️ THE SHARE IS DRAWN PER INSTANCE, from the same stream, so which marks
     move is part of the world rather than a second decision. */
  const beatOf = (v: Variant) => (v.beat && r() < (v.moving ?? 0) ? v.beat : null);

  /*
    ⚠️ A LATTICE DECIDES THE TILE, and it has to. The pattern repeats at the tile
    size, so a cell that does not divide it exactly is a row of half-cells down
    every seam — visible as a ruled line across the page, at the one pitch the
    eye is best at finding. The cell is taken as close to what the family asked
    for as a whole number of them allows, and the tile becomes their sum.
  */
  /*
    ⚠️ DENSITY RESIZES A LATTICE THE OPPOSITE WAY FROM A SCATTER, AND THE FIRST
    VERSION HAD IT BACKWARDS. For a scatter, presence is HOW MANY: `quiet` means
    fewer marks. For a lattice there is no count — it fills what it is given — so
    presence is HOW BIG, and dividing by the density made `quiet` produce a
    coarse bold weave with metre-wide arcs, which is louder than the default in
    every way that matters. Both directions mean the same thing to the person
    asking: more of the family, or less of it.
  */
  const lattice = family.tiles?.[0];
  const cell = lattice ? lattice.cell * Math.sqrt(density) : 0;
  const wide = lattice ? Math.max(1, Math.round(want.w / cell)) : 0;
  const tall = lattice ? Math.max(1, Math.round(want.h / cell)) : 0;

  /*
    ⚠️ THE BUDGET BINDS WHETHER ANYTHING MOVES, and that is the half a motion
    setting cannot reach. A still field is still a string the browser parses and
    a tree it rasterises: a lattice fine enough to read as a weave over a
    1400 × 1000 tile is thousands of nodes, and the cost lands on the first paint
    of every screen — on the device least able to afford it, before anybody has
    seen anything.

    ⚠️ THE TILE SHRINKS, NEVER THE CELL. Growing the cell to spend fewer nodes
    changes the DRAWING — a truchet is scale more than it is anything else, and a
    coarser weave is a different family — while a smaller tile is the same
    picture repeating sooner. The repeat is the price, and it is the right one:
    the pattern is the same at every size, so what a repeat costs is a symmetry
    somebody might notice on a wide screen, against a field that would otherwise
    be half a megabyte.

    ⚠️ AND IT IS A NUMBER OF WHOLE CELLS, for the reason the lattice exists: a
    tile that is not a whole number of cells puts a row of half-cells down every
    seam, which is a ruled line across the page at the one pitch the eye is best
    at finding.
  */
  const per = family.tiles?.length ?? 0;
  const over = per && wide * tall * per > MARKS
    ? Math.sqrt(MARKS / (wide * tall * per)) : 1;
  const cols = lattice ? Math.max(1, Math.floor(wide * over)) : 0;
  const rows = lattice ? Math.max(1, Math.floor(tall * over)) : 0;
  const tile = lattice ? { w: cols * cell, h: rows * cell } : want;

  for (const t of family.tiles ?? []) {
    for (let iy = 0; iy < rows; iy += 1) {
      for (let ix = 0; ix < cols; ix += 1) {
        const v = pick(r, t.variants);
        const beat = beatOf(v);
        const at = `translate(${+(ix * cell).toFixed(1)} ${+(iy * cell).toFixed(1)})`
          + ` scale(${+cell.toFixed(2)})`;
        marks.push(placed(at, beat, v.draw(palette, r)));
      }
    }
  }

  if (family.drawn) marks.push(family.drawn(palette, r, tile));

  const megapixels = (tile.w * tile.h) / 1_000_000;
  /* ⚠️ THE SAME BUDGET, SHARED WITH WHAT THE LATTICE ALREADY SPENT. A family can
     have both, and two budgets counted separately is a field that passes each
     and blows the sum. */
  let left = Math.max(0, MARKS - marks.length);
  for (const speck of family.specks ?? []) {
    const count = Math.min(left, Math.round(speck.per * megapixels * density));
    left -= count;
    for (const [x, y] of scatter(r, tile.w, tile.h, count)) {
      const v = pick(r, speck.variants);
      const beat = beatOf(v);
      marks.push(placed(`translate(${x} ${y})`, beat, v.draw(palette, r)));
    }
  }

  /*
    ⚠️ IDS ARE DOCUMENT-SCOPED NOW, WHICH THEY WERE NOT INSIDE A DATA URI. Two
    fields on one page both declaring `#l` is the first one winning and the
    second one's marks filling with nothing — silent, and exactly the kind of
    thing that only happens once two screens are open at the same time. The
    engine owns this whole string and nothing outside can reference into it, so
    rewriting both halves of every pair is total: the conformance test already
    proves the pairs match, so the rewrite cannot break one.
  */
  const ns = `q${hash(`${family.id}|${scene.seed}`).toString(36)}`;
  const scoped = (svg: string) =>
    svg.replace(/\bid="([\w-]+)"/g, `id="${ns}-$1"`).replace(/url\(#([\w-]+)\)/g, `url(#${ns}-$1)`);

  const shared = marks.length && family.defs ? `<defs>${family.defs(palette)}</defs>` : "";
  const body = scoped(`${shared}${marks.join("")}`);

  return {
    /* ⚠️ `userSpaceOnUse` AND THE TILE IS IN CSS PIXELS. A pattern in object
       units would resize with the viewport, so the same world would be a
       different constellation on a phone and on a laptop — which is what a
       stretched sky looks like, and the reason the old background version pinned
       an explicit `background-size`. */
    field: marks.length
      ? `<defs><pattern id="${ns}-tile" width="${tile.w}" height="${tile.h}"`
        + ` patternUnits="userSpaceOnUse">${body}</pattern></defs>`
        + `<rect width="100%" height="100%" fill="url(#${ns}-tile)"/>`
      : "",
    ...(() => {
      /* ⚠️ ONE STREAM FOR THE WHOLE GROUND, and the family splits its own result
         — see `Ground`. Two prngs would mean the band and the bloom it belongs
         to were placed independently, which is a light in one corner and its
         glow in another. */
      const made = family.ground(palette, prng(hash(`${family.id}|ground|${scene.seed}`)));
      const parts = Array.isArray(made) ? { layers: made, flare: [] } : made as Ground;
      return {
        /* ⚠️ THE DEPTH GOES ON TOP, AND THE FIRST DRAFT PUT IT AT THE BOTTOM.
           `background-image` reads TOPMOST FIRST, and every family's last layer
           is an opaque base — so a crush appended after it is painted underneath
           something with no transparency and changes not one pixel. Measured
           that way and reported identical numbers across all nine families,
           which is what a layer nobody can see looks like from a distance. */
        ground: [...depth(family, scene.seed), ...parts.layers].join(", "),
        flare: (parts.flare ?? []).join(", "),
      };
    })(),
    veil: family.veil?.(palette) ?? "",
    wash: family.wash?.(palette) ?? "",
  };
}
