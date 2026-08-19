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
import { BEAT, DURATION, EASE, transition } from "./motion.js";
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
  /*
    ⚠️ WIDE ENOUGH TO CLEAR THE WHOLE READING AREA, NOT JUST A CARD. At 58% × 46%
    the hole was narrower than the content on every shape in the system, so the
    world ran at full strength either side of a column of text and behind most of
    it — which is what makes a ground read as wallpaper rather than as depth. The
    ellipse is the SAME idea as the hem one axis over: the material is strongest
    where nothing is, and gone where something is.
  */
  const column = "radial-gradient(96% 70% at 50% 46%,"
    + " transparent 0%, color-mix(in oklab, black 34%, transparent) 46%, black 80%)";
  const both = `${ramp}, ${column}`;
  return `mask-image: ${both}; -webkit-mask-image: ${both};`
    + ` mask-composite: intersect; -webkit-mask-composite: source-in`;
})();

/**
 * ⚠️ ONE VIEWPORT, NOT A BAND — see the header. A ground that stops behind the
 * crown draws a line across the page; one that lasts a screen and fades has
 * depth, and is gone by the time anybody has scrolled past it.
 *
 * ⚠️ `dvh`, AND IT IS THE SAME UNIT THE FRAME IS SIZED IN. `Page` is
 * `min-h-dvh`; this fills it and is `position: absolute` inside it, with only
 * `overflow-x: clip` above — so at `100vh` the ground stood taller than the
 * frame by exactly the height of a phone's browser chrome, hung past the bottom,
 * and made EVERY page in the product scrollable by that much with nothing to
 * scroll to. Two units for one viewport is the whole of it.
 *
 * ⚠️ AND NO TEST COULD HAVE SEEN IT. Headless Chromium has no browser chrome, so
 * `100vh === 100dvh` there and the overflow is exactly zero — the fault only
 * exists on the devices nothing in this repository runs on. That is what
 * `scripts/scene.test.mjs` asserts instead: not the pixels, but that the ground
 * and the frame are measured in the same unit.
 */
export const REACH = "100dvh";

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

/** ⚠️ One stop of the hem — see the rule. `0%` is the SAME colour at zero alpha,
    never `transparent`, which is transparent black and blooms grey as it fades. */
const hemStop = (pct: number): string =>
  `color-mix(in oklab, var(--scene-veil, var(--background)) ${pct}%, transparent)`;

/**
 * THE HEM, IN ONE DIRECTION OR THE OTHER.
 *
 * ⚠️ ONE FUNCTION FOR BOTH EDGES, BECAUSE THEY ARE ONE IDEA AND WOULD DRIFT AS
 * TWO. Written out twice, the top and the bottom are five numbers each that have
 * to stay equal, and the first thing anybody tunes is one of them.
 *
 * ⚠️ `hold` IS WHERE THE CONTROLS END, NOT WHERE THE BOX DOES, AND THE
 * DIFFERENCE BETWEEN THOSE IS WHAT MADE IT BITE. A crown is `min-h-16` and its
 * controls are `h-11` centred in it, so the last pixel of a button is at 54px
 * while the header's own box runs to 64 and the hold was set to 96 — forty-two
 * pixels of FULL opacity below anything anybody can see, and then the falloff on
 * top of that. The chrome stopped blending with the screen and started sitting
 * on a panel with a soft edge, which is the plate this whole idea replaces.
 *
 * ⚠️ SO IT IS MEASURED, PER EDGE, AND THE TWO ARE NOT THE SAME. The crown's
 * controls end 3.375rem from the top; the nav's bar begins 4.5rem from the
 * bottom. Rounded up a notch each so the opaque part reaches the control's edge
 * and stops — "barely reaching it" is the whole brief, because a hem that
 * clears the control by a margin is a bar again.
 *
 * ⚠️ THE FALLOFF IS SHARED AND IT IS THE NUMBER WITH THE TENSION IN IT. Too
 * short and the fade's own top edge becomes a visible line, which is the border
 * being removed; too long and content dies halfway up a screen nobody has
 * scrolled. An earlier version ran 12rem at both ends on the theory that a page
 * is read downwards — shot both ways, no visible difference, and both were too
 * much.
 *
 * ⚠️ AND THE TOP ONE IS NOT THERE UNTIL SOMETHING IS BEHIND IT, WHICH IS THE
 * DIFFERENCE BETWEEN A VIGNETTE AND A BAR. The hem is OPAQUE — it has to be, or
 * a card's text reads straight through a crown title — and opaque against the
 * world means the field's marks stop at the fade and resume below it. On a page
 * nobody has scrolled that is a flat strip of one colour across the top with a
 * pattern under it, which is a bar whatever the softness of its edge. Measured:
 * with the hem hidden, the pattern runs through the crown; with it on, the top
 * 110px has none.
 *
 * ⚠️ THE RESOLUTION IS THAT AT SCROLL ZERO THERE IS NOTHING TO DISSOLVE. The hem
 * exists for content passing UNDER the chrome; before anybody scrolls there is
 * none, so it fades in with the first movement and the crown sits on the world
 * until then. Lowering the opacity instead was tried at four strengths and every
 * one of them read a card through the title — the fault is not how strong it is,
 * it is that it was on when it had no work to do.
 *
 * ⚠️ THE BOTTOM ONE IS ALWAYS ON, AND THAT IS NOT AN INCONSISTENCY. "Is anything
 * behind the crown" is exactly `scrollY > 0`; "is anything behind the nav" is
 * not answerable from the scroll position, because a page shorter than the
 * viewport can still end underneath it. A cheap precise question at one end and
 * no such question at the other.
 */
const hem = (edge: "top" | "bottom") => {
  const far = edge === "top" ? "bottom" : "top";
  /* ⚠️ hold: measured to the control's own edge — see above. fade: shared. */
  const [hold, fade] = edge === "top" ? [3.5, 3.5] : [4.75, 3.5];
  const run = hold + fade;
  const mid = (at: number) => +(hold + fade * at).toFixed(2);
  return [
    `[data-hem="${edge}"]::before {`,
    `  content: ""; position: absolute; left: 0; right: 0;`,
    `  ${edge}: 0; ${far}: -${run}rem;`,
    `  pointer-events: none; z-index: -1;`,
    /* ⚠️ The gradient runs AWAY from the edge it is hemming, so `to top` at the
       bottom and `to bottom` at the top — the opaque end is always the screen's
       own edge, where there is nothing to have a boundary against. */
    `  background: linear-gradient(to ${far},`,
    `    var(--scene-veil, var(--background)) 0,`,
    `    ${hemStop(99)} ${hold}rem, ${hemStop(70)} ${mid(1 / 3)}rem,`,
    `    ${hemStop(32)} ${mid(2 / 3)}rem, ${hemStop(0)} ${run}rem);`,
    /*
      ⚠️ THE STRENGTH IS A PROPERTY AND THE TRANSITION IS ON `opacity`, WHICH IS
      THE ONLY SHAPE THAT ANIMATES. A custom property inside a gradient is not
      interpolable — the browser swaps one gradient for another and the hem
      appears in a single frame, which reads as a flash rather than as arriving.
      Driving `opacity` from the property leaves the transition on a real
      animatable property, and it is the compositor's.

      ⚠️ IT DEFAULTS TO 1, so a page that mounts no listener at all — a test, a
      screen rendered outside `Page` — gets the hem rather than nothing. A
      missing feature should be the SAFE state, and the safe state here is the
      one that cannot let a card read through a title.
    */
    `  opacity: var(--hem-${edge}, 1);`,
    /* ⚠️ `moderate`, not `quick` — the hem arriving is ambient rather than a
       response to a press, and at the pace of a control it reads as a flicker
       on the first few pixels of a scroll. */
    `  transition: ${transition("opacity", "moderate")};`,
    `}`,
  ];
};

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
    /*
      ⚠️ THE GROUND'S OWN COLOUR, PUBLISHED, SO CHROME CAN BE MADE OF IT. A chip
      floating on a scene has to be legible without being a hole punched in the
      world — and the only fill that is neither is the world's own value, a
      little denser. `--on-scene` uses the same colour for a halo; this is the
      raw one, for a surface.
    */
    "--scene-veil": made.veil || "transparent",
    /* ⚠️ SET EVEN WHERE THE FAMILY DECLARES NO VEIL, as `none` — because the
       token is read with a fallback and an absent property would inherit the
       PARENT scene's halo on a nested page. A world that says nothing about its
       type must say `none` rather than say nothing. */
    "--on-scene": made.veil ? halo(made.veil) : "none",
  } };
}



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

    ⚠️ AND THE `.q-` CLASS IS ON A RENDERED LAYER, NEVER ON A MARK. It was on
    the mark — one `<g>` per placement inside the `<pattern>` — and the whole
    system was inert for as long as it existed: Chromium rasterises a pattern's
    tile ONCE and paints the cache, so an animation declared inside one is
    created, is reported by `getAnimations()`, and never repaints. Measured by
    screenshot rather than by API: identical pixels a second and a half apart,
    on every family. `render` splits the marks by beat and gives each group its
    own layer, so what carries the class is an element the page actually draws.

    ⚠️ ONE KEYFRAME PER BEAT, BECAUSE THE DIP IS THE BEAT'S. A single shared
    `1 → .3` is right for a star and is the whole page throbbing when the mark is
    a fifth of the screen wide — see `BEAT`.
  */
  const names = Object.keys(BEAT) as (Extract<keyof typeof BEAT, string>)[];
  const beats = [
    `@media (prefers-reduced-motion: no-preference) {`,
    ...names.flatMap((b) => [
      `@keyframes one-${b} { 0%, 100% { opacity: 1 } 50% { opacity: ${BEAT[b].dip} } }`,
      `.q-${b} { animation: one-${b} ${BEAT[b].period} ${EASE.plain} infinite ${BEAT[b].delay}; }`,
    ]),
    `}`,
    /*
      ⚠️ THE IN-APP SWITCH, FOR WHOM THIS IS NOT A PREFERENCE — see `REDUCED`.

      ⚠️ AND THE ANCESTOR IS REPEATED ON EVERY SELECTOR, WHICH IT WAS NOT. This
      was one `[data-reduce-motion="true"]` followed by a comma-separated list,
      and a descendant combinator binds to the FIRST selector only — so six of
      the seven beats were `animation: none` for EVERYBODY, unconditionally,
      from the day the line was written. It was invisible because the beats were
      inside a `<pattern>` and none of them painted either: two faults stacked,
      each of them the reason nobody could see the other.
    */
    ...names.map((b) => `[data-reduce-motion="true"] .q-${b} { animation: none; }`),
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
    /* ⚠️ THE HOST'S OWN RADIUS — see the ground layers below for what this fixes. */
    `  border-radius: inherit;`,
    `  ${MATTE};`,
    `}`,
    /*
      ⚠️ THE FIELD DRIFTS TOO, AGAINST THE GROUND, AND WITHOUT THIS HALF OF THE
      FAMILIES DO NOT MOVE AT ALL. A beat is carried by a placed MARK, so a
      family that draws its whole field in one stroke — `cloth`, which is the
      material under every workspace and account screen in the product — has
      nowhere to put one and was completely still. Measured: one animation on
      the page, the ground's, and its whole travel was four pixels.
      ⚠️ AND TWO LAYERS MOVING TOGETHER IS NOT DEPTH, IT IS ONE LAYER. What makes
      a ground read as material rather than as a picture is the marks moving
      ACROSS the light behind them — so this runs the other way, at a fraction of
      the distance, and the two are out of phase by a negative delay rather than
      by a second period nobody would be able to name.
      ⚠️ SCALED, BECAUSE TRANSLATING SOMETHING THAT EXACTLY COVERS ITS BOX
      UNCOVERS AN EDGE. The overscan is what there is to move — the same reason
      the ground is at 1.1.
    */
    `@keyframes one-float {`,
    `  from { transform: translate3d(1.2%, 0.8%, 0) scale(1.05); }`,
    `  to { transform: translate3d(-1.2%, -0.8%, 0) scale(1.08); }`,
    `}`,
    `@media (prefers-reduced-motion: no-preference) {`,
    `  [data-field] {`,
    `    animation: one-float ${DURATION.ambient} ${EASE.plain} infinite alternate;`,
    /* ⚠️ NEGATIVE, SO IT STARTS PART-WAY THROUGH RATHER THAN WAITING. A positive
       delay would hold the field still for nine seconds after every page load,
       which is most of the time anybody spends on a screen. */
    `    animation-delay: -9s;`,
    `  }`,
    `}`,
    `[data-reduce-motion="true"] [data-field] { animation: none; }`,
  ];

  return [
    /* ⚠️ `-1` and `isolation` on the host, or the layer paints over the content
       of any ancestor that happens to create a stacking context.

       ⚠️ AND THE HOST CLIPS ON BOTH AXES, BECAUSE THE OVERSCAN IS MEANT TO BE
       UNSEEN. The drifting layer is `scale(1.14)` and translated — that is what
       there is to move — so it hangs past every edge. Unclipped, the DOCUMENT
       grows: the page scrolls into nothing, and further every second, because
       the scroll area tracks the animation.

       ⚠️ ONE AXIS WAS CLIPPED AND THE OTHER WAS NOT, AND THE SECOND HALF IS THE
       ONE PEOPLE FELT. Measured on the sign-in door at 412×830: the document was
       869 tall — 39px of scroll under a screen with nothing below the fold, on
       every page in the product. The reasoning for leaving the block axis alone
       was that the page still has to scroll; it does, and clipping does not stop
       it. The host is `min-h-dvh` and GROWS with its content, so content is
       never outside the box — the only thing beyond it is the ornament.

       ⚠️ `clip`, NEVER `hidden`, AND THAT IS THE PART THAT IS ACTUALLY FRAGILE.
       `hidden` makes this a scroll container and every `sticky` crown and nav
       inside it stops sticking. Measured, all three: with `overflow-x: clip` and
       with `overflow: clip` a sticky crown holds at 0 after a 900px scroll; with
       `overflow: hidden` it rides away to -900. */
    `[data-sky] { position: relative; isolation: isolate; overflow: clip; --sky: 1; }`,
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
    /*
      ⚠️ AND THE DISTANCE IS THE PART THAT WAS WRONG. This drifted half a percent
      each way — four pixels on a phone, across twenty-four seconds, which is a
      quarter of a pixel a second. It is not a subtle animation, it is an absent
      one: measured on the screens people actually look at, the page held
      completely still. The rule an ambience has to satisfy is that it is
      noticeable if you watch it and invisible if you do not, and only the first
      half of that was ever tested.
    */
    `@keyframes one-drift {`,
    `  from { transform: translate3d(-2.4%, -1.6%, 0) scale(1.1); }`,
    `  to { transform: translate3d(2.4%, 1.6%, 0) scale(1.18); }`,
    `}`,
    `@media (prefers-reduced-motion: no-preference) {`,
    `  [data-sky]:not([data-sky="plain"])::before {`,
    `    animation: one-drift ${DURATION.ambient} ${EASE.plain} infinite alternate;`,
    `  }`,
    `}`,
    `[data-reduce-motion="true"] [data-sky]:not([data-sky="plain"])::before { animation: none; }`,
    `[data-sky]:not([data-sky="plain"])::before,`,
    `[data-sky]:not([data-sky="plain"])::after {`,
    `  content: ""; position: absolute; top: 0; left: 0; right: 0;`,
    `  height: ${REACH}; bottom: auto; z-index: -1;`,
    `  pointer-events: none;`,
    /*
      ⚠️ THE HOST'S OWN RADIUS, AND WITHOUT IT A CARD IS ROUNDED AND SHARP AT
      ONCE. A page has no radius so this is a no-op there, which is why it was
      missing for as long as a page was the only thing wearing a ground; a card
      is 24px round and these layers were square, so the world's own light ran
      into all four corners past the card's edge. It reads as a rendering fault
      rather than as ambience, and it is the first thing anybody notices.

      ⚠️ IT CANNOT BE `overflow: hidden` ON THE HOST. That makes the host a
      scroll container, and every sticky crown and nav inside one stops
      sticking — the note beside `overflow-x: clip` below is the same trap.
    */
    `  border-radius: inherit;`,
    `}`,
    /* ⚠️ The dither, over everything, at a rounding error — see `GRAIN`. */
    `[data-sky]:not([data-sky="plain"])::after {`,
    `  background-image: ${GRAIN};`,
    `  background-repeat: repeat;`,
    `  opacity: ${GRAIN_OPACITY};`,
    `  mix-blend-mode: overlay;`,
    /*
      ⚠️ AND IT RECEDES WITH THE WORLD, WHICH IT DID NOT — SO THE GROUND ENDED IN
      THE ONE THING THIS FILE'S HEADER SAYS IT MUST NOT HAVE. The ground layer
      wears the matte and this one wore nothing, so at exactly `100vh` the dither
      stopped dead: measured as a four-level step in luminance, razor-edged,
      right across a page whose world had otherwise faded to almost nothing. On
      anything taller than a viewport it reads as a scrim for a chrome that is
      not there, which is what it was reported as.

      ⚠️ `FADE` AND NOT `MATTE` — the vertical ramp alone, no ellipse. The hole
      down the reading column is what keeps a WORLD off the words; a dither at
      three percent has nothing to get out of the way of, and punching a hole in
      it would leave the middle of every page undithered, which is where banding
      is most visible. `FADE` has existed for this since the file was written
      and was applied to nothing.
    */
    `  ${FADE};`,
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
    /*
      ⚠️ AND A CARD CLIPS ITS WORLD ON BOTH AXES, WHICH `border-radius: inherit`
      ALONE DOES NOT DO. The layer is rounded and then TRANSFORMED — the drift is
      `scale(1.14)` plus a translate, which is what there is to move — so the
      rounded shape is scaled past the card's actual corner. On a 288px card that
      is ~20px of overhang, and the brightest part of a seeded `glow` is a pole
      that can sit exactly there: one square, lit corner on an otherwise rounded
      card, which is the first thing anybody notices.

      ⚠️ `clip`, AND ON BOTH AXES ONLY HERE. `hidden` makes an element a scroll
      container and every `sticky` crown and nav inside one stops sticking, which
      is why the page clips the inline axis alone (see below). A card has no
      sticky descendant, so it can afford the block axis too — and `clip` honours
      the border radius, which is the whole point.
    */
    `[data-sky][data-reach="card"] { overflow: clip; }`,
    /* ⚠️ A bleeding ambience must reach the edge even inside a padded column. */
    `[data-bleed="edge"]::before, [data-bleed="edge"]::after {`,
    `  left: 50%; right: auto; width: 100vw; transform: translateX(-50%);`,
    `}`,
    /*
      ⚠️ CHROME IS MADE OF THE GROUND NOW, AND THE BLUR IS GONE. It was glass —
      `backdrop-filter: blur(11px) saturate(1.4) contrast(1.2) brightness(0.92)`
      — and the argument for it was sound while the ground was a still picture:
      blur what does not scroll, and a fixed bar over a static gradient costs one
      readback. That argument died with the scene engine. The field is a LIVE
      element with marks that twinkle, breathe and turn, so every frame of every
      beat invalidates the backdrop under every chip and the browser re-reads and
      re-blurs it — a per-frame full-layer readback for chrome nobody is looking
      at, on the device least able to afford it.

      ⚠️ AND IT WOULD LOOK WRONG BEFORE IT LOOKED SLOW. A blur averages what is
      behind it, so a chip over a moving field shows a smear that CHANGES as the
      marks move under it — the one thing a fixed control must never do.

      ⚠️ SO A CHIP IS A DENSER PATCH OF THE WORLD, WHICH IS THE THING GLASS WAS
      IMITATING. `--scene-veil` is the ground's own colour, published by
      `worldCss` — the same value the halo over a hero title is built from. A
      fill of it reads as the ground THICKENING under the control rather than as
      a plate laid on top: no readback, no smear, and it follows every family,
      every seed and both themes without a second recipe.

      ⚠️ IT FALLS BACK TO THE RAISED TIER, and that is what makes it usable on a
      page with no scene at all. `--surface-tertiary` is the tier the palette
      guarantees clears both the page and a card, which is exactly the guarantee
      a chip needs where there is no world to be made of.
    */
    /*
      ⚠️ THE WORLD'S HUE AT THE PALETTE'S VALUE, AND THE FIRST VERSION HAD ONLY
      THE FIRST HALF. A fill of the veil alone is right on a night ground — the
      veil is dark, the chip reads as the ground thickening — and INVISIBLE on a
      day one, because a light world's veil IS the paper. Measured: a bar at
      `oklab(0.991 …)` on a page at `oklab(0.99 …)`, which is chrome nobody can
      find. A chip has to be separable wherever it lands, in both themes, over
      seven families.

      ⚠️ SO THE VALUE COMES FROM `--surface-tertiary`, which the palette
      GUARANTEES clears both the page and a card, and the hue comes from the
      world. Neither alone is enough: the tier alone is the grey plate glass was
      hiding, and the veil alone is the paper.
    */
    `[data-chrome="true"] {`,
    `  background-color: color-mix(in oklab,`,
    `    var(--surface-tertiary) 72%, var(--scene-veil, var(--surface-tertiary))) !important;`,
    `}`,
    `[data-chrome="true"]:hover {`,
    `  background-color: color-mix(in oklab,`,
    `    var(--surface-tertiary) 90%, var(--scene-veil, var(--surface-tertiary))) !important;`,
    `}`,
    /*
      ⚠️ `data-capsule` HAD NO RULE AT ALL, WHICH IS WHY THE NAV WAS A RECTANGLE.
      Two elements carried the attribute and both were `Card`s, which bring their
      own radius — so the attribute meant nothing and nobody could tell. The nav
      is a plain element now and it came out square-ended, which is the same
      defect finally becoming visible. An attribute nothing reads is a promise
      the next caller believes.
    */
    /*
      ⚠️ THE HEM — THE GROUND THICKENING BEHIND WHATEVER IS PINNED TO AN EDGE,
      SO THE CHROME NEEDS NO PLATE OF ITS OWN. Both edges: a crown at the top
      and a nav or a docked action at the bottom.

      ⚠️ THE PROBLEM IT SOLVES IS COLLISION, NOT CONTRAST. A bar with its own
      fill is legible — and content still runs INTO it: the page's next row
      arrives at the capsule's rounded end and is sliced by it, so a face is cut
      in half down the left gutter and a heading reappears in the gaps either
      side. That reads as two layers fighting, which is exactly what it is.
      Nothing about the bar's own colour can fix it, because the fault is
      OUTSIDE the bar.

      ⚠️ A FADE IS NOT A PLATE, AND THE DIFFERENCE IS THE EDGE. Everything the
      no-glass pass removed was a band with a BOUNDARY — a line across the
      screen where the treatment stopped, which is a border by another name.
      This has no boundary anywhere: it is opaque at the very bottom, where the
      screen ends and there is nothing to have an edge against, and it is gone
      by the top. Content dissolves into the ground on its way under the
      controls instead of being cut by them.

      ⚠️ IT IS BUILT FROM `--scene-veil`, so it is the world's own colour — dark
      on a night ground, paper on a day one, and right under every family and
      every workspace with no second recipe. A black scrim would be the wash
      `scene.test.mjs` fails on, and correctly: it dims somebody's brand to fix
      one screen.

      ⚠️ THE STOPS ARE IN `rem`, NOT PERCENT, AND THAT IS LOAD-BEARING. The
      element is anchored to the bottom, so absolute stops measure up from the
      screen edge and hold full strength across the bar's own height whatever
      that height is. Written in percent the falloff starts partway up the bar —
      measured, and it left the ghost of a heading behind the icons.

      ⚠️ AND THE LAST STOP REPEATS THE COLOUR AT ZERO RATHER THAN SAYING
      `transparent`. `transparent` is transparent BLACK, and a gradient
      interpolating toward it darkens as it fades — a grey bloom above the bar
      on a light page, from a rule that never names a grey.
    */
    /*
      ⚠️ IT SETS NO `position` OF ITS OWN, AND THE FIRST VERSION DID. A
      `position: relative` here is the obvious way to give the pseudo something
      to anchor to — and it OVERRODE the `sticky` every one of these three
      elements is, so the nav stopped pinning and left the screen entirely. All
      three hosts are positioned already, because being docked is what they are
      for; a hem on something static is a hem with nothing to be at the bottom
      of.
    */
    ...hem("bottom"),
    ...hem("top"),
    `[data-capsule="true"] { border-radius: 9999px; }`,
    /*
      ⚠️ THE NAV HAS NO FILL OF ITS OWN NOW — THE HEM IS ITS BACKGROUND — SO THE
      WHOLE "WHERE AM I" ANSWER IS INK. With a capsule under them the five items
      read as one control and the open one lifts off it; with the hem under them
      they read as five marks on a page, which is only a nav if one of them is
      obviously the answer. It gets two channels, and neither is a surface: full
      foreground against a distinctly recessive `--muted`, and the only word on
      the bar.

      ⚠️ THE CLOSED FOUR ARE PUSHED PAST `--muted`, WHICH IS THE ONE NUMBER HERE
      SOMEBODY TUNED. `--muted` is the token for secondary TEXT and is calibrated
      to be READ; beside an active item that is now only ink rather than
      ink-on-a-pill, that is not enough separation to answer "where am I" at a
      glance.

      ⚠️ AND THE FLOOR IS A RULE, NOT TASTE. A closed item is a glyph carrying a
      destination with no word beside it — the WCAG non-text-contrast case, 3:1
      against what is behind it — so this can be thinned until it approaches that
      and no further. A nav item nobody can find is worse than one that competes
      with the active item, which is the direction this number moves under
      pressure.

      ⚠️ IT IS AN ALPHA ON A TOKEN RATHER THAN A SECOND COLOUR, so it follows
      `--muted` in both themes and under every workspace. A hand-picked grey
      here would be right on one ground and a hole in the other.

      ⚠️ COLOUR RATHER THAN OPACITY, because the unread dot is INSIDE the
      button. Fading the button fades the one mark on this bar whose whole job
      is to be noticed, and the dot carries its own tone token — so it survives
      a colour change and would not survive an alpha one.
    */
    /*
      ⚠️ THE DESTINATIONS ARE INK — AND THE ACT IS NOT A DESTINATION. This rule
      was written when the bar held nothing else, so it painted every button in
      it muted and let `[data-here]` win back the one you are on. A screen's
      primary action moved into the bar (`Island.act`), and it is a FILLED
      control: the muted colour beat the variant's own foreground and the one
      word on the primary rendered grey on white. Excluded by name rather than by
      variant, because "which button is the act" is the bar's fact and not the
      library's.
    */
    `[data-island="true"] button:not([data-here="true"]):not([data-act="true"]) {`,
    `  color: color-mix(in oklab, var(--muted) 58%, transparent); }`,
    /*
      ⚠️ WHERE YOU ARE IS INK, AND THAT ONLY BECAME POSSIBLE WITH THE HEM. This
      painted `--default` — the control tier — and it had to: the bar under it
      was a filled capsule, so the answer to "where am I" needed a surface that
      clears the surface it sits on. With no bar there is nothing to clear, and a
      lozenge inside nothing is a shape drawn round a word for its own sake: one
      more edge, in a system that spent a whole pass removing them.
    */
    `[data-here="true"] { color: var(--foreground); }`,
    /*
      ⚠️ AND THE LABEL INSIDE IT HAS TO BE TOLD, WHICH IS A SPECIFICITY FACT
      RATHER THAN A DESIGN ONE. The open word is `TYPE.note`, and `note` is
      `text-sm text-muted` — a single class, exactly as specific as this rule, so
      which one wins is decided by stylesheet ORDER and not by intent. The
      destination somebody is standing on then reads dimmer than the four icons
      around it, which is the one thing the compact bar cannot afford: the word
      that is showing is the whole point of it.

      ⚠️ THE ATTRIBUTE IS DOUBLED TO WIN, and that is deliberately visible. The
      alternative is a colour class at the call site, and a component that names
      a colour is a component a workspace's branding never reaches (D7). `inherit`
      rather than the token, so there is still one source: the button above.
    */
    `[data-here="true"][data-here] * { color: inherit; }`,
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
    `[data-chip="true"] { background-color: color-mix(in oklab, var(--foreground) 7%, transparent); }`,
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
