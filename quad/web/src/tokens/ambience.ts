/**
 * WHAT SITS BEHIND A SCREEN — the ground, its light, its material and its grain.
 *
 * ⚠️ NAMED, NEVER A COLOUR (D7). Each ambience is a SHAPE OF LIGHT; the hue comes
 * from whatever the workspace's BRAND is at the time. A screen that named a
 * colour would stop matching the moment somebody changed their brand, and nobody
 * would connect the two.
 *
 * ⚠️ AN AMBIENCE IS FOUR LAYERS, NOT ONE GRADIENT, AND THAT IS THE WHOLE
 * DIFFERENCE. The first version of this file put one radial wash behind a screen
 * and called it ambience; against a product that does this well it read as a
 * light leak — flat, banded, obviously a CSS gradient. A ground that reads as
 * MATERIAL has:
 *
 *   1. a WASH — the deep base, so the screen has a colour rather than a tint
 *   2. FORMS — two to four soft poles of light at different values, which is what
 *      gives it somewhere to travel and stops it reading as a single blur
 *   3. DEPTH — a vignette pulling the corners down, which is most of why a
 *      photographic backdrop looks lit rather than filled
 *   4. GRAIN — a barely-there fine texture. This one is not decoration: a large
 *      smooth gradient BANDS on an 8-bit display, and the banding is the single
 *      clearest tell of a cheap background. A little noise dithers it away.
 *
 * ⚠️ ONE HUE, MANY VALUES. Every ambience below is built from the accent alone
 * (or the tone's token), varied by strength and spread, with light and shadow
 * doing the rest. Reaching for a second colour is what turns a branded surface
 * into somebody's idea of a nice gradient, and it cannot follow a tenant's brand.
 * `aurora` is the one exception and it declares its companion in writing.
 *
 * ⚠️ THEY ARE CSS RATHER THAN IMAGES, and that is not a compromise. A PNG is
 * bytes on every cold load and a FIXED colour, so it cannot follow a tenant's
 * accent — which is the entire point of the system. What CSS costs is that the
 * shapes have to be composed rather than photographed, which is what the four
 * layers above are for.
 *
 * ⚠️ AND IT REACHES A WHOLE VIEWPORT, NOT A BAND. Ambience belongs to the top of
 * a screen and should be gone by the time somebody has scrolled one screen —
 * which means a height of `100vh` and a long fade, not a strip behind the crown.
 * A `60vh` version of this file put the ramp above the fold and made every
 * patterned screen end in a visible horizontal edge.
 */

/* ⚠️ The pace and the curve are the vocabulary's, not this file's — see `DRIFT`. */
import { BEAT, DURATION, EASE, turns } from "./motion.js";
import {
  DENSITY, FAMILIES, render, type Density, type SceneFamily, type Sky,
} from "../scene/index.js";

const NOISE = [
  "%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E",
  "%3Cfilter id='n'%3E",
  "%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E",
  "%3CfeColorMatrix type='saturate' values='0'/%3E",
  "%3C/filter%3E",
  "%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E",
  "%3C/svg%3E",
].join("");

const GRAIN = `url("data:image/svg+xml,${NOISE}")`;

/**
 * ⚠️ AND IT IS APPLIED BY OPACITY AND A BLEND, NOT BY A COLOUR. Noise painted as
 * a colour is a texture; noise blended at two percent is a rounding error in the
 * gradient underneath it, which is all dither ever needs to be.
 */
const GRAIN_OPACITY = "calc(var(--sky, 1) * 0.035)";

/**
 * ⚠️ THE MASK IS WHY IT READS AS DEPTH RATHER THAN AS A PANEL. Without it every
 * ground ends in a hard horizontal edge, which is the single thing that makes an
 * ambient background look like a mistake. The ramp is long and starts late: an
 * early fade wastes the ambience on the part of the screen the crown is already
 * covering.
 */
/**
 * ⚠️ THE RAMP STARTS LATE AND LANDS LATE. It used to start dropping at 45% and
 * be half gone by 72%, which is precisely why every ambience read as SHY — the
 * world died at mid-screen and the lower half of every page was bare ground
 * with a decorated hat on it. The ambience now holds to past the fold and puts
 * its whole fade into the last stretch, so content lands ON the world rather
 * than after it.
 */
export const FADE = (() => {
  const ramp = "linear-gradient(180deg, black 0%, black 62%, "
    + "color-mix(in oklab, black 60%, transparent) 84%, transparent 100%)";
  return `mask-image: ${ramp}; -webkit-mask-image: ${ramp}`;
})();

/**
 * THE VIGNETTE, AND IT IS A MASK RATHER THAN A WASH.
 *
 * ⚠️ THE DIFFERENCE IS THE WHOLE POINT. A ground that has to be COVERED to be
 * readable is a ground that is too loud, and the cover is a grey film over
 * somebody's brand: a scrim, a `bg-black/40`, an overlay div — every one of them
 * makes the world dimmer everywhere rather than quieter where it matters, and
 * every one is a decision a screen took locally that nobody can see from the
 * outside. What a scene does instead is RECEDE: its own alpha drops where
 * content sits, so the page's own ground shows through and the world is still at
 * full strength at the edges.
 *
 * ⚠️ AN ELLIPSE DOWN THE READING COLUMN, because that is where content is on
 * every shape in the system — `read` and `work` are both centred, and the two
 * bands a screen is built from are the same column at two widths. Wide enough to
 * clear a card, soft enough that the boundary is never a shape somebody can see.
 *
 * ⚠️ AND IT MULTIPLIES WITH `FADE`, WHICH IS WHY BOTH ARE IN ONE PROPERTY.
 * `mask-image` takes a list and composites it — the vertical ramp and this
 * ellipse together are one matte, and separating them into `mask-image` and
 * `-webkit-mask-image` on different rules is how one of them silently stops
 * applying.
 */
export const MATTE = (() => {
  const ramp = "linear-gradient(180deg, black 0%, black 62%, "
    + "color-mix(in oklab, black 60%, transparent) 84%, transparent 100%)";
  /* ⚠️ `transparent` at the CENTRE — a mask is alpha, so transparent is where
     the ground is hidden and black is where it survives. Written the other way
     round the world appears only behind the text, which looks like a bug in the
     one place it is hardest to notice. */
  const column = "radial-gradient(58% 46% at 50% 46%,"
    + " transparent 0%, color-mix(in oklab, black 55%, transparent) 46%, black 78%)";
  const both = `${ramp}, ${column}`;
  return `mask-image: ${both}; -webkit-mask-image: ${both};`
    + ` mask-composite: intersect; -webkit-mask-composite: source-in`;
})();

/**
 * ⚠️ ONE VIEWPORT, NOT A BAND — see the header. A ground that stops behind the
 * crown draws a line across the page; one that lasts a screen and fades has
 * depth, and is gone by the time anybody has scrolled past it.
 */
export const REACH = "100vh";

/** The layers of one ambience, innermost last, as `background-image` entries. */
export type { SceneFamily, Sky };

/**
 * A NAMED SKY, WHICH IS THE SAME MECHANISM WITH THE THEME AS ITS PALETTE.
 *
 * ⚠️ THIS IS WHAT REPLACED `sky="calm"`. A screen with no subject still wants a
 * ground, and what it names now is a FAMILY rather than one of twenty-four
 * hand-drawn worlds — so `glow` behind two different screens is two different
 * grounds of one material, which is what "an app wears one material" was always
 * trying to say and could not.
 *
 * ⚠️ THE SEED IS THE SCREEN'S OWN IDENTITY, and it is the whole reason this is
 * better than a name. Passing the route means every screen in a product has its
 * own world inside the product's family, for free, forever, with nobody choosing
 * anything. Passing nothing means every `glow` page is the same page, which is
 * also a legitimate answer and is why the parameter has a default.
 *
 * ⚠️ AND THE PALETTE IS THE THEME'S, WHICH IS WHY ONLY SOME FAMILIES ARE
 * NAMEABLE. `var(--brand)` inside an SVG is a string rather than a colour, so a
 * family whose marks take the palette would draw them with nothing at all — see
 * `SKIES` and `Family.ink`.
 */
export const skyWorld = (sky: Exclude<Sky, "plain">, seed: string = sky): World =>
  ({ family: sky, deep: "var(--background)", lit: "var(--brand)", seed });

export interface World {
  /** ⚠️ A place is a `space`; a person is an `aura`. See `worldFor`. */
  readonly family: SceneFamily;
  /** The subject's own deep — its background, straight out of the picture. */
  readonly deep: string;
  /** The subject's body colour: the light this world is lit by. */
  readonly lit: string;
  /**
   * ⚠️ THE SEED TRAVELS WITH THE COLOURS, IN ONE OBJECT, so a caller cannot hand
   * over one and forget the other. As two arguments this was a `world` prop and
   * a `worldSeed` prop that had to agree — and a page given the colours but no
   * seed is a sky with no stars, which looks deliberate.
   */
  readonly seed: string;
}

/*
  ⚠️ BAKED PER SCENE AND KEPT. A workspace's sky is rebuilt on every render of
  the screen it is on, and two hundred marks through `encodeURIComponent` is not
  free at 60fps while somebody scrolls.
*/
const skies = new Map<string, ReturnType<typeof render>>();

/**
 * TYPE SITTING DIRECTLY ON A WORLD, AND THE ONE TREATMENT THAT IS NOT A SCRIM.
 *
 * ⚠️ THE PROBLEM IS REAL AND THE OBVIOUS FIX IS THE ONE THAT WAS TRIED AND
 * REMOVED. A name laid across a lit sphere has light on one side of a stroke and
 * dark on the other, so no single ink is legible over all of it; a plate behind
 * the words is wider than the subject and sits on plain sky as two dark patches
 * either side of it, which is precisely what the hero looked like the first time.
 * A HALO in the ground's own colour has no shape at all — it is the world,
 * blurred, a few pixels out from every edge — and it doubles the local contrast
 * without dimming anything.
 *
 * ⚠️ THREE RADII, BECAUSE ONE IS EITHER AN OUTLINE OR A SMUDGE. A tight opaque
 * ring reads as a sticker; a single wide blur is a grey cloud. Tight-and-strong
 * for the stroke edges, wide-and-weak for the value underneath, and one very
 * wide at almost nothing to seat the block.
 *
 * ⚠️ AND IT IS AN OPT-IN TOKEN, NOT A RULE ON THE PAGE. Text inside a card is
 * already on a surface, and a halo under it would be a shadow on paper —
 * `[data-sky] *` would put one under every word in the product.
 */
export const ON_SCENE = "var(--on-scene, none)";

const halo = (colour: string): string => {
  const soft = (pct: number) => `color-mix(in oklab, ${colour} ${pct}%, transparent)`;
  return `0 1px 2px ${soft(88)}, 0 2px 16px ${soft(66)}, 0 0 40px ${soft(40)}`;
};

/**
 * THE PROPERTIES `world` READS. Hand the result to `Page` and a workspace's
 * planet becomes the ground under its screen.
 *
 * ⚠️ PROPERTIES, NOT A BACKGROUND. What a screen sets is VALUES; which layers
 * use them is written once in `layers("world")`. A screen handed a whole
 * `background-image` would be a screen that could put anything there — and the
 * first one to do it is a page a workspace's branding no longer reaches (D7).
 */
export function worldCss(
  world: World, at: { readonly night: boolean; readonly density: Density },
): { readonly css: Readonly<Record<string, string>>; readonly field: string } {
  const key = `${world.family}|${world.seed}|${world.deep}|${world.lit}`
    + `|${at.night ? "n" : "d"}|${at.density}`;
  let made = skies.get(key);
  if (!made) {
    made = render({
      family: FAMILIES[world.family][at.night ? "night" : "day"],
      seed: world.seed,
      palette: { deep: world.deep, lit: world.lit },
      density: DENSITY[at.density],
    });
    skies.set(key, made);
  }
  return { field: made.field, css: {
    "--world-ground": made.ground,
    /* ⚠️ SET EVEN WHERE THE FAMILY DECLARES NO VEIL, as `none` — because the
       token is read with a fallback and an absent property would inherit the
       PARENT scene's halo on a nested page. A world that says nothing about its
       type must say `none` rather than say nothing. */
    "--on-scene": made.veil ? halo(made.veil) : "none",
  } };
}

/**
 * ⚠️ THE GLASS RECIPE, IN ONE PLACE AND IN THIS ORDER. Filters compose in the
 * order written: blurring first and correcting after is what recovers colour and
 * form; correcting first and blurring after averages the correction away.
 */
const GLASS = "blur(11px) saturate(1.4) contrast(1.2) brightness(0.92)";

/** ⚠️ Light's own stack — it LIFTS. See the milk-vs-smoke note at the rules. */
const GLASS_LIGHT = "blur(14px) saturate(1.5) contrast(1.04) brightness(1.05)";


/**
 * THE RULES A SCENE PAINTS INTO — and there is no rule per world any more.
 *
 * ⚠️ THE OLD SHEET EMITTED ONE SELECTOR PER NAMED GROUND, each with its own
 * layer list, its own background sizes and its own drift numbers, plus a second
 * set for the per-theme baked drawings. A scene brings its ground in as a VALUE,
 * so what is left is the same handful of rules whatever family is on the
 * element: the ground's box, the field's box, the grain, one drift and the
 * beats.
 */
export function ambienceStylesheet(): string {
  /*
    ⚠️ THE BEATS ARE THE STYLESHEET'S NOW, AND THAT IS THE HALF THAT MAKES THEM
    RUN. They used to be a `<style>` element inside the field's own SVG, which is
    the right design for a picture and the wrong one for a picture nothing
    animates: an SVG used as `background-image` is rendered statically by
    Chromium, so a star that declared a twinkle simply never twinkled. The field
    is a live element now, so the page's own CSS reaches it — one definition
    rather than one per scene, and both opt-outs for free.

    ⚠️ ONE KEYFRAME PER BEAT, BECAUSE THE DIP IS THE BEAT'S. A single shared
    `1 → .3` is right for a star and is the whole page throbbing when the mark is
    a fifth of the screen wide — see `BEAT`.
  */
  const names = Object.keys(BEAT) as (Extract<keyof typeof BEAT, string>)[];
  const beats = [
    `@media (prefers-reduced-motion: no-preference) {`,
    ...names.flatMap((b) => [
      /*
        ⚠️ A TURN NEEDS `fill-box`, AND WITHOUT IT THE TILE ORBITS THE PAGE. An
        SVG element's default `transform-origin` is the user-space ORIGIN, not
        its own middle — so a rotation meant to spin a tile in place swings it
        around the top-left corner of the whole picture instead. It is the one
        line that separates "the pattern re-routes itself" from "everything
        slides off the screen", and nothing warns.
      */
      turns(b)
        ? `@keyframes quad-${b} {`
          + ` 0%, 17% { transform: rotate(0deg) } 23%, 42% { transform: rotate(90deg) }`
          + ` 48%, 67% { transform: rotate(180deg) } 73%, 92% { transform: rotate(270deg) }`
          + ` 98%, 100% { transform: rotate(360deg) } }`
        : `@keyframes quad-${b} { 0%, 100% { opacity: 1 } 50% { opacity: ${(BEAT[b] as { dip: number }).dip} } }`,
      `.q-${b} { animation: quad-${b} ${BEAT[b].period} ${EASE.plain} infinite ${BEAT[b].delay};`
        + `${turns(b) ? " transform-box: fill-box; transform-origin: center;" : ""} }`,
    ]),
    `}`,
    /* ⚠️ The in-app switch, for whom this is not a preference — see `REDUCED`. */
    `[data-reduce-motion="true"] ${names.map((b) => `.q-${b}`).join(", ")} { animation: none; }`,
  ];

  /*
    ⚠️ THE FIELD IS AN ELEMENT AND IT WEARS THE SAME MATTE THE GROUND DOES. Two
    layers of one world receding differently would put a visible edge exactly
    where content sits, which is the one place a ground must be invisible.
  */
  const field = [
    `[data-field] {`,
    `  position: absolute; top: 0; left: 0; right: 0; width: 100%;`,
    `  height: ${REACH}; z-index: -1; pointer-events: none;`,
    `  ${MATTE};`,
    `}`,
  ];

  return [
    /* ⚠️ `-1` and `isolation` on the host, or the layer paints over the content
       of any ancestor that happens to create a stacking context. */
    `[data-sky] { position: relative; isolation: isolate; --sky: 1; }`,
    /*
      ⚠️ ONE MULTIPLIER PER THEME, AND IT IS DOWN TO ONE. This carried five —
      `--sky`, `--thread`, `--etch`, `--lumen`, `--field` — because twenty-four
      hand-tuned grounds each needed light mode handled a different way, and each
      knob was a rule somebody had to remember when adding the twenty-fifth. A
      family declares a `day` OF ITS OWN instead, so the only thing genuinely
      per-theme left is how much dither a ground needs.

      ⚠️ Both selector forms, because the stamp may be on the host or an ancestor.
    */
    `[data-theme="light"] [data-sky], [data-theme="light"][data-sky] { --sky: 0.55; }`,
    ...beats,
    ...field,
    /*
      ⚠️ ONE RULE FOR EVERY GROUND. `--world-ground` is set on the element by
      `worldCss`; the layer list, the sizing and the matte are the same whichever
      family produced it, which is exactly what having an engine buys.
    */
    `[data-sky]:not([data-sky="plain"])::before {`,
    `  background-image: var(--world-ground, none);`,
    `  background-size: cover; background-repeat: no-repeat;`,
    `  ${MATTE};`,
    `}`,
    /*
      ⚠️ ONE DRIFT, TOO. There was a table of per-ambience drift numbers, which
      is one more thing to tune per world; a scene varies by seed, so the breath
      can be one set of numbers for all of them.

      ⚠️ `alternate` RATHER THAN A LOOP: a drift that runs to its end and jumps
      back is a twitch every N seconds, far more noticeable than the movement
      itself — the one thing a ground must never do is draw the eye.

      ⚠️ AND IT SCALES PAST 1 THROUGHOUT. Translating a layer that exactly covers
      its box uncovers an edge; the overscan is what there is to move.

      ⚠️ SWITCHED OFF BOTH WAYS. `prefers-reduced-motion` is the operating
      system's answer and `data-reduce-motion` is the one reachable from a
      settings screen inside the app — a ground that answered only the first
      would keep moving for the person who turned it off where they could see the
      switch. For some people this is not a preference.
    */
    `@keyframes quad-drift {`,
    `  from { transform: translate3d(-0.5%, -0.4%, 0) scale(1.1); }`,
    `  to { transform: translate3d(0.5%, 0.4%, 0) scale(1.14); }`,
    `}`,
    `@media (prefers-reduced-motion: no-preference) {`,
    `  [data-sky]:not([data-sky="plain"])::before {`,
    `    animation: quad-drift ${DURATION.ambient} ${EASE.plain} infinite alternate;`,
    `  }`,
    `}`,
    `[data-reduce-motion="true"] [data-sky]:not([data-sky="plain"])::before { animation: none; }`,
    `[data-sky]:not([data-sky="plain"])::before,`,
    `[data-sky]:not([data-sky="plain"])::after {`,
    `  content: ""; position: absolute; top: 0; left: 0; right: 0;`,
    `  height: ${REACH}; bottom: auto; z-index: -1;`,
    `  pointer-events: none;`,
    `}`,
    /* ⚠️ The dither, over everything, at a rounding error — see `GRAIN`. */
    `[data-sky]:not([data-sky="plain"])::after {`,
    `  background-image: ${GRAIN};`,
    `  background-repeat: repeat;`,
    `  opacity: ${GRAIN_OPACITY};`,
    `  mix-blend-mode: overlay;`,
    `}`,
    /*
      ⚠️ A CARD-SIZED AMBIENCE FITS THE CARD. The reach above is one VIEWPORT,
      which is right for a screen and two bright streaks inside something the
      size of a destination card — the shapes are composed for a wide field and
      only the top corner of one lands. Same layers, same tokens, one height.
    */
    `[data-sky][data-reach="card"]::before, [data-sky][data-reach="card"]::after,`
      + ` [data-field][data-reach="card"] {`,
    `  height: 100%;`,
    `}`,
    /* ⚠️ A bleeding ambience must reach the edge even inside a padded column. */
    `[data-bleed="edge"]::before, [data-bleed="edge"]::after {`,
    `  left: 50%; right: auto; width: 100vw; transform: translateX(-50%);`,
    `}`,
    /*
      ⚠️ CHROME OVER AN AMBIENCE IS GLASS, NOT PAINT. A solid pill over a lit
      ground is a hole punched in it — the ground is the thing that makes the
      screen, and every opaque control sitting on it takes a piece away. A
      translucent fill of the FOREGROUND token blurs whatever is behind it, so
      the same rule works on olive, on violet and on white without knowing which
      it is on. This is also why a control here is never tinted with the accent:
      see the icon rule below.

      ⚠️ GLASS IS FOR CHROME THAT DOES NOT SCROLL, WHICH IS THE ONLY LINE THAT
      MATTERS. The cost is real — the backdrop is read back and blurred, per
      frame, per layer — so a scrolling list of translucent cards is a phone
      with a weak GPU working hard for nothing. Four fixed chips and one bar are
      not that.

      ⚠️ A NOTE HERE ONCE CLAIMED THE BLUR CANNOT SAMPLE THROUGH `[data-sky]`'s
      `isolation: isolate`. Measured, it samples through it perfectly well; what
      was wrong was the FILL — at twelve percent over a card there is nothing
      for a blur to separate, so it looked flat and the flatness was diagnosed
      as the blur being absent. A wrong cause in a comment is worse than no
      comment, because the next person builds on it.
    */
    /*
      ⚠️ A LONG BLUR AND A LIGHT FILL, IN THAT ORDER OF IMPORTANCE. What makes
      glass read as glass is that the world behind it is RECOGNISABLE and
      unreadable at the same time — colour and movement survive, detail does
      not. That is a property of the blur radius, not of the opacity: a short
      blur under a heavy fill is a frosted panel, which is a different and older
      material. Twenty-eight pixels is past the point where 16px text stops
      resolving into words, so the fill can stay light.

      ⚠️ AND THE SATURATION BOOST IS NOT A FLOURISH. Blurring averages colours
      toward grey, so a plate over a coloured ground comes out duller than the
      ground it is made of — which is exactly the "dusty" reading, arrived at by
      a different route. Pushing saturation back up is what keeps the glass the
      colour of what is behind it.
    */
    /*
      ⚠️ ONE FILTER STACK, WRITTEN ONCE. Blur is only the first term: saturation
      puts back what averaging toward grey takes out, contrast keeps the shapes
      behind from going flat, and a slight darkening is what stops a plate over
      a bright ground reading as a wash. Four terms rather than one is the
      difference between glass and a frosted panel.
    */
    /*
      ⚠️ GLASS IS A VEIL OF THE RAISED TIER, NOT A WASH OF THE FOREGROUND, and
      the difference is what makes it translucent rather than merely see-through.
      A foreground tint at any strength a person can see past is one you can
      READ past — the row under the nav came through it and collided with the
      labels, two sets of words in the same place.

      ⚠️ AND THIS WAS THE ISLAND'S RULE ALONE, WHICH IS WHY THE CROWN HAD THE
      SAME BUG A SECOND TIME. The base was a ten-percent foreground wash and only
      the nav overrode it, so when the crown's chips became the only glass on the
      screen a quick-action label read straight through the search field at full
      size. There is one fill now: the value that was already proved.

      ⚠️ AND IT CANNOT BE A VEIL OF `--background` EITHER, which is the obvious
      choice and the one that fails in the interesting place: over the page's own
      ground it would BE the ground, so a chip would vanish exactly where there
      is no card behind it. `--surface-tertiary` is the tier the palette
      guarantees clears both the page and a card, so a veil of it is separable
      wherever it lands — and a quarter of whatever is behind still comes
      through, blurred, which is the whole effect.
    */
    `[data-glass="true"] {`,
    `  background-color: color-mix(in oklab, var(--surface-tertiary) 76%, transparent) !important;`,
    `  backdrop-filter: ${GLASS};`,
    `  -webkit-backdrop-filter: ${GLASS};`,
    `}`,
    /*
      ⚠️ THE PILL THAT MARKS WHERE YOU ARE, AS A RULE RATHER THAN A CLASS. It is
      one element that TRAVELS between four equal columns — see `Island` — so it
      needs a fill and a radius and nothing else. `--default` is the control
      tier, which the palette guarantees clears both the raised tier under it
      and the surfaces around it.
    */
    /*
      ⚠️ THE PILL IS GLASS ON GLASS, which is the only way it reads as sitting ON
      the bar rather than being cut out of it. Its backdrop is the bar's already
      filtered plate, so it needs no blur of its own — a second blur of an
      already blurred thing costs a full readback and changes almost nothing.
      What it needs is to be BRIGHTER and a touch more saturated than what it
      covers, which is what a raised piece of glass does to the light through it.
    */
    `[data-pill="true"] {`,
    `  background-color: color-mix(in oklab, var(--default) 72%, transparent);`,
    `  border-radius: 9999px;`,
    `  backdrop-filter: brightness(1.14) saturate(1.25);`,
    `  -webkit-backdrop-filter: brightness(1.14) saturate(1.25);`,
    `}`,
    `@media (prefers-reduced-motion: reduce) { [data-pill="true"] { transition: none !important; } }`,
    `[data-glass="true"]:hover {`,
    `  background-color: color-mix(in oklab, var(--surface-tertiary) 92%, transparent) !important;`,
    `}`,
    /*
      ⚠️ DARK GLASS IS SMOKE, LIGHT GLASS IS MILK — one recipe cannot be both.
      The dark stack darkens what passes under it (brightness 0.92), which over
      a glowing field reads as depth. The same darkening over PAPER is a grey
      film — the exact "dusty" reading, produced by the chrome itself — and the
      grey tertiary veil doubles it. So light gets its own recipe: a veil of
      the SURFACE tier (white-leaning, so the bar reads as material rather
      than as shadow), and a filter that LIFTS — brightness above one — while
      the saturation boost keeps the world's colour alive through it.
    */
    `[data-theme="light"] [data-glass="true"], [data-theme="light"][data-glass="true"] {`,
    `  background-color: color-mix(in oklab, var(--surface) 68%, transparent) !important;`,
    `  backdrop-filter: ${GLASS_LIGHT};`,
    `  -webkit-backdrop-filter: ${GLASS_LIGHT};`,
    `}`,
    `[data-theme="light"] [data-glass="true"]:hover, [data-theme="light"][data-glass="true"]:hover {`,
    `  background-color: color-mix(in oklab, var(--surface) 88%, transparent) !important;`,
    `}`,
    `[data-theme="light"] [data-pill="true"], [data-theme="light"][data-pill="true"] {`,
    `  background-color: color-mix(in oklab, var(--surface) 85%, transparent);`,
    `  backdrop-filter: brightness(1.04) saturate(1.2);`,
    `  -webkit-backdrop-filter: brightness(1.04) saturate(1.2);`,
    `}`,
    /*
      ⚠️ A TILE IS A CARD YOU PRESS, NOT AN OVERSIZED CHIP. The control tier is
      tuned for chip-sized things between surfaces; spread across a 7rem square
      it reads as a grey slab — off-white beside true-white cards in light, a
      pale brick over the world in dark. So a tile takes the SURFACE tier, the
      same material as the cards it sits beside, through the button's own
      background hooks rather than a repaint — hover intact, tier arithmetic
      intact, and the rule lives here because a component that named a colour
      would be one a workspace's branding never reaches (D7).
    */
    `[data-tile="true"] { --button-bg: var(--surface); --button-bg-hover: var(--surface-tertiary); }`,
    /*
      ⚠️ THE CHIP A ROW'S MARK SITS IN. It is here rather than on the component
      for the same reason the dot is: a component that named a colour would be
      one a workspace's branding never reaches (D7). `foreground` at seven
      percent is a fill that works on a card in either theme without knowing
      which theme it is in.
    */
    /* ⚠️ WHERE YOU ARE IS THE ONE LABEL YOU CAN READ — see `Island`. */
    `[data-here="true"] { color: var(--foreground); }`,
    `[data-chip="true"] { background-color: color-mix(in oklab, var(--foreground) 7%, transparent); }`,
    /* ⚠️ THE UNREAD DOT, COLOURED BY ITS TONE RATHER THAN BY A LITERAL. It is
       here rather than in a component because a component that named a colour
       would be one a workspace's branding never reaches (D7). */
    `[data-dot="true"] { border-radius: 9999px; background: var(--danger); }`,
    `[data-dot="true"][data-tone="accent"] { background: var(--accent); }`,
    /*
      ⚠️ ONE OPTICAL WEIGHT FOR EVERY GLYPH IN THE PRODUCT. An icon library takes
      its size from its own props, so one caller passing nothing draws at the
      library default beside one that passed 20 — and a list with two icon sizes
      is the single most visible sign of a surface nobody owns. Setting it on the
      BOX means a caller cannot get it wrong.
    */
    `[style*="--icon"] > svg { width: var(--icon); height: var(--icon); }`,
    `[style*="--icon"] > svg { stroke-width: 1.75; }`,
    /* ⚠️ THE ISLAND'S COLLAPSE, AS A RULE RATHER THAN AN INLINE STYLE. It shrinks
       when its labels go to `sr-only`, and an inline `style` on the component
       would beat every branding token it otherwise answers to. */
    `[data-island="true"] { transition: all var(--default-transition-duration) var(--ease-out-fluid); }`,
    `@media (prefers-reduced-motion: reduce) { [data-island="true"] { transition: none; } }`,
  ].join("\n");
}
