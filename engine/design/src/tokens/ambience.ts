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
import { DURATION, EASE, MOTION, transition } from "./motion.js";
import { GLOW, ICON } from "./metrics.js";
import {
  DENSITY, FAMILIES, render, type Density, type SceneFamily, type Sky,
} from "../scene/index.js";

/**
 * HOW ROUND A SURFACE IS, AS THE LIBRARY'S OWN EXPRESSION RATHER THAN A NUMBER.
 *
 * ⚠️ THE CARD IS THE ONE THAT DECIDES AND EVERYTHING ELSE FOLLOWS IT. `.card` is
 * `min(32px, var(--radius-3xl))`; the library's `.button--md` is 36 — so a tile
 * and the card above it curved differently by four pixels, which is not a
 * difference anybody can name and is exactly what "no attention to radius" looks
 * like. Copying the card's expression means the clamp moves once and every
 * surface follows.
 */
const SURFACE_RADIUS = "min(32px, var(--radius-3xl))";

const NOISE = [
  "%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E",
  "%3Cfilter id='n'%3E",
  "%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E",
  "%3CfeColorMatrix type='saturate' values='0'/%3E",
  "%3C/filter%3E",
  "%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E",
  "%3C/svg%3E",
].join("");

/**
 * ⚠️ EXPORTED, BECAUSE THE CURTAIN HAS THE SAME PROBLEM AND MUST NOT GROW A
 * SECOND ANSWER TO IT. A large smooth gradient BANDS on an 8-bit display —
 * measured on the opening as visible rings around the name — and this is already
 * the fix, tuned, in the file that owns what a ground is made of. A second noise
 * source is a second grain: different frequency, different weight, and the two
 * visibly different on the two screens that sit next to each other in a boot.
 */
export const GRAIN = `url("data:image/svg+xml,${NOISE}")`;

/**
 * ⚠️ AND IT IS APPLIED BY OPACITY AND A BLEND, NOT BY A COLOUR. Noise painted as
 * a colour is a texture; noise blended at two percent is a rounding error in the
 * gradient underneath it, which is all dither ever needs to be.
 */
export const GRAIN_OPACITY = "calc(var(--sky, 1) * 0.035)";

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
/**
 * THE SOURCE'S OWN FALLOFF, AND IT IS MUCH STEEPER THAN THE GROUND'S.
 *
 * ⚠️ A LIGHT BELONGS TO THE TOP OF A SCREEN, WHICH A GROUND ONLY HALF DOES.
 * `FADE` holds a world to 62% and lets it die by the fold, which is right for a
 * wash — content lands ON it rather than after it. A hard bright band held that
 * far down is a bright diagonal running through the middle of a list, and
 * measured on a tall page it crossed six cards and two headings. What reads as a
 * lamp over a screen is a band that is gone before the second block.
 *
 * ⚠️ AND IT IS THE VERTICAL RAMP ALONE. The matte's ellipse exists so a WORLD
 * does not run under a paragraph; a band is a few percent of the width and is
 * exactly what a screen leading with one figure wants passing behind it.
 */
export const LIGHT = (() => {
  const ramp = "linear-gradient(180deg, black 0%, black 26%, "
    + "color-mix(in oklab, black 46%, transparent) 52%, transparent 78%)";
  return `mask-image: ${ramp}; -webkit-mask-image: ${ramp}`;
})();

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
 * THE FALLOFF, AS STOPS AN EYE CANNOT FIND THE JOINS IN.
 *
 * ⚠️ SMOOTHSTEP, AND THE REASON IS WHICH END IT IS FLAT AT. A straight ramp
 * changes at one rate and so shows BOTH its ends as faint lines. `1 - t²` was
 * tried and is worse in the way that matters: its slope is steepest at t=1, so
 * the fade's far end is where it changes fastest — putting a visible edge in
 * exactly the place this whole shape exists to remove one. `1 - (3t² - 2t³)` is
 * flat at both ends and steepest in the middle: it leaves the solid part without
 * a seam and arrives at nothing without one either.
 *
 * ⚠️ AND THE STEP SIZE IS THE POINT, NOT THE COUNT. Eight stops over a long fade
 * and three over a short one are the same curve at different resolutions; what
 * shows a join is a big jump between neighbours. Measured across this curve the
 * widest is 18 points, in the middle, where the eye is least able to find it.
 */
const hemStops = (hold: number, fade: number): string => {
  const steps = 8;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    return `${hemStop(+(100 * (1 - t * t * (3 - 2 * t))).toFixed(1))} `
      + `${+(hold + fade * t).toFixed(2)}rem`;
  }).join(", ");
};

/**
 * HOW FAR THE VEIL IS FULLY OPAQUE, IN `rem`, AND THEREFORE WHERE A PAGE'S OWN
 * CONTENT STOPS BEING READABLE AT AN EDGE.
 *
 * ⚠️ EXPORTED BECAUSE IT IS A FACT ABOUT THE SCREEN, NOT ONLY ABOUT THIS FILE.
 * "Is the page's heading still legible" is the question the crown's hand-off is
 * really asking, and the answer is this number — anything above it at the top of
 * a page is behind solid veil. A second copy of it somewhere else would be a
 * hand-off tuned against a hem that had since moved.
 */
export const HEM_HOLD = 4.25;

/**
 * THE HEM, IN ONE DIRECTION OR THE OTHER.
 *
 * ⚠️ ONE FUNCTION FOR BOTH EDGES, BECAUSE THEY ARE ONE IDEA AND WOULD DRIFT AS
 * TWO. Written out twice, the top and the bottom are five numbers each that have
 * to stay equal, and the first thing anybody tunes is one of them.
 *
 * ⚠️ WHAT MAKES IT A BAR IS THE RATIO, NOT THE FLAT PART. Two attempts got this
 * wrong in opposite directions and both were measured in a browser. The first
 * held the veil FULL for 76px — as far as the controls reach — and then fell to
 * nothing in 56: the flat part was longer than the fade, so the eye found the
 * fade's own top as an edge and read the whole thing as a slab with a soft lip.
 * The second removed the flat part altogether, which cured the edge and broke
 * the job: at the height of the nav's own controls the veil was 80%, so a card's
 * text read straight through the glyphs sitting on it.
 *
 * ⚠️ SO IT IS FULL WHERE THE CONTROLS ARE AND THE FALLOFF IS TWICE THAT AGAIN.
 * A photographic vignette is solid at the frame's edge too; what stops it
 * reading as a panel is that the transition out of it is longer than the solid
 * part and has no discernible end. Content is properly gone behind the chrome —
 * which is the whole job — and there is no distance at which the veil visibly
 * stops.
 *
 * ⚠️ AND THE STEPS ARE SMALL ENOUGH THAT NO JOIN SHOWS. The eye finds a break in
 * the SLOPE of a gradient long before it finds one in the value, and this is the
 * largest soft shape in the product; a ramp described by three stops shows all
 * three. `hemStops` walks an ease-out with no step wider than 18 points.
 *
 * ⚠️ ONE GEOMETRY, BOTH EDGES, AND THAT IS THE WHOLE POINT OF ONE FUNCTION. The
 * two used to be measured separately — the crown's controls end 3.375rem down,
 * the nav's begin 4rem up — which is a real difference of 10 pixels and a
 * visible difference of none. What it bought was two numbers that had to be
 * tuned in step and never were, and a product whose head and foot were the same
 * idea at two strengths. It is the taller of the two now, mirrored, so the top
 * and the bottom of a screen are one shape.
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
 * ⚠️ BOTH ENDS ASK THE SAME QUESTION, AND FOR A LONG TIME ONLY ONE OF THEM ASKED
 * IT. "Is anything behind the crown" is `scrollY > 0`; "is anything behind the
 * nav" is how much page is still below the fold — one subtraction, and until it
 * was written the bottom hem fell to its default of 1 on every screen. Opaque,
 * always, with the field's marks stopping dead at its top edge: a bar, by the
 * definition three paragraphs up.
 *
 * ⚠️ AND THE TRANSITION IS NOT THERE UNTIL THE FIRST ANSWER IS IN. `opacity`
 * transitions from the CSS default, so a page that mounts already knowing there
 * is nothing behind its nav would FADE the hem out over a third of a second —
 * an interface visibly undoing itself in front of somebody who has just arrived.
 * `data-hems` is stamped a frame after the first read, so arriving is instant
 * and every answer after it is eased.
 */
const hem = (edge: "top" | "bottom") => {
  const far = edge === "top" ? "bottom" : "top";
  /*
    ⚠️ THE SOLID PART IS SET BY WHAT IT HAS TO HIDE, AND ONLY THE FALLOFF IS
    TASTE. `hold` is the height of the controls that stand on this edge —
    anything less and a card's text reads through the glyphs sitting on it, which
    is what `chrome.seen.test.tsx` measures. So shortening a hem that ran too far
    means shortening the FADE, and shortening the wrong one is a legibility bug
    wearing a taste fix's clothes.

    ⚠️ AND IT RAN TOO FAR. At 4.25 + 8.5 the vignette dissolved 204px of an 844px
    phone to hold one 64px row legible — a quarter of the screen, which stops
    reading as the ground thickening into an edge and starts reading as the page
    fading out.
  */
  const hold = HEM_HOLD;
  const fade = 5.5;
  /*
    ⚠️ AND IT OVERSHOOTS THE EDGE IT HEMS, WHICH IS NOT PADDING — IT IS THE FIX
    FOR A GAP. A hem rides a `sticky` row, and a sticky row does not always end
    up flush with the screen: at the head it sits at its FLOW position, below
    whatever the page reserves above it; at the foot it pins to the SCROLLPORT,
    which on a phone is not the same box as the visible area while the browser's
    own toolbar is up. Either way the vignette starts a few pixels in and a strip
    of undissolved page shows along the very edge. Overshooting is invisible,
    because the overshot part is the SOLID end of the gradient — it costs nothing
    and it cannot be got wrong.

    ⚠️ THE FOOT HAD NONE, AND THE ARGUMENT FOR THAT WAS ABOUT A TEST. It said an
    overshoot would make the solid part MEASURE longer than the fade — true, and
    a fact about a guard reading raw gradient stops rather than about the screen.
    A stop beyond the edge paints nothing; the guards quote every stop from the
    SCREEN's edge now, which is what a person is looking at, and the two ends are
    one geometry again.

    ⚠️ AND NO HARNESS HERE CAN SEE THIS ONE. Headless Chromium has no dynamic
    toolbar and no sub-pixel viewport, so the layer reaches the edge exactly in
    every measurement this repository can take — the gap was photographed on a
    phone. What is structural, and what `scene.test.mjs` asks, is that both edges
    overshoot at all.
  */
  const over = 4;
  const run = over + hold + fade;
  return [
    `[data-hem="${edge}"]::before {`,
    `  content: ""; position: absolute; left: 0; right: 0;`,
    `  ${edge}: -${over}rem; ${far}: -${hold + fade}rem;`,
    `  pointer-events: none; z-index: -1;`,
    /* ⚠️ The gradient runs AWAY from the edge it is hemming, so `to top` at the
       bottom and `to bottom` at the top — the opaque end is always the screen's
       own edge, where there is nothing to have a boundary against. */
    `  background: linear-gradient(to ${far},`,
    `    var(--scene-veil, var(--background)) 0,`,
    `    ${hemStops(over + hold, fade)});`,
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
    /* ⚠️ AND NO TRANSITION, BECAUSE THE SCROLL IS THE TRANSITION. The strength
       is the amount of page behind the hem (`useHems`), so it already moves
       continuously with the finger — an ease on top of that is the veil lagging
       the page it is dissolving. It carried a 260ms one for as long as the
       property was a BOOLEAN, and a second rule to suppress that ease on the
       first answer, and neither has anything left to do. */
    `  opacity: var(--hem-${edge}, 1);`,
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
  world: World,
  at: { readonly night: boolean; readonly density: Density; readonly still?: boolean },
): {
  readonly css: Readonly<Record<string, string>>;
  readonly field: string;
  /** ⚠️ Whether the family reaches the SURFACES — see `Family.wash`. */
  readonly wash: boolean;
  /** ⚠️ Whether there is a source to put on its own layer — see `Ground`. */
  readonly flare: boolean;
} {
  /* ⚠️ `still` IS IN THE KEY, because it changes the DRAWING rather than a rule.
     A beat is SMIL and SMIL cannot be switched off by CSS, so a world rendered
     for somebody who wants less motion is a different string — and a cache that
     did not know that would hand it the moving one. */
  const key = `${world.family}|${world.seed}|${world.deep}|${world.lit}`
    + `|${at.night ? "n" : "d"}|${at.density}|${at.still ? "s" : "m"}`;
  let made = skies.get(key);
  if (!made) {
    made = render({
      family: FAMILIES[world.family][at.night ? "night" : "day"],
      seed: world.seed,
      palette: { deep: world.deep, lit: world.lit },
      density: DENSITY[at.density],
      still: at.still === true,
    });
    skies.set(key, made);
  }
  return { field: made.field, wash: !!made.wash, flare: !!made.flare, css: {
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
    /*
      ⚠️ WHAT THE LIGHT LANDS ON — see `Family.wash`. The surfaces standing in a
      world are the half a ground cannot reach on its own: a pill and a card keep
      the grey the palette gave them however bright it is two layers down, and
      the result reads as wallpaper hung behind a working screen.

      ⚠️ AND `none` RATHER THAN ABSENT, for the reason the halo is: the token is
      read with a fallback, so an absent property inherits the PARENT scene's
      wash on a nested page — a card in a quiet world coming out the colour of
      the loud one two levels up.
    */
    "--scene-wash": made.wash || "none",
    /* ⚠️ THE SOURCE, ON ITS OWN LAYER — empty for every family whose light is a
       haze. See `Ground` and the `[data-flare]` rule. */
    "--world-flare": made.flare || "none",
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
    ⚠️ THE BEATS ARE NOT HERE ANY MORE, AND THAT IS NOT A SIMPLIFICATION — IT IS
    THE ONLY PLACE THEY WORK. A mark lives inside a `<pattern>`, and Chromium
    rasterises a pattern's tile once and paints the cache: a CSS animation
    declared in there is created, is reported by `getAnimations()`, and repaints
    nothing. SMIL in the same place does repaint, measured three ways, so the
    beat travels with the drawing (`render`) and this file no longer knows the
    word. What it costs is that reduced motion is decided at RENDER rather than
    by a media query, which `useScenery` does from both signals.

    ⚠️ AND THE ANSWER IN BETWEEN MADE THE SKY PULSE. Splitting the marks into one
    rendered layer per beat put the animation somewhere CSS could reach — and
    faded a fifth of the sky at once. "The ambience flickers" was exactly right.
  */
  /*
    ⚠️ THE FIELD IS AN ELEMENT AND IT WEARS THE SAME MATTE THE GROUND DOES. Two
    layers of one world receding differently would put a visible edge exactly
    where content sits, which is the one place a ground must be invisible.
  */
  const field = [
    `[data-field] {`,
    `  position: absolute; top: 0; left: 0; right: 0; width: 100%;`,
    `  height: ${REACH}; z-index: -3; pointer-events: none;`,
    /* ⚠️ THE HOST'S OWN RADIUS — see the ground layers below for what this fixes. */
    `  border-radius: inherit;`,
    `  ${MATTE};`,
    `}`,
    /*
      ⚠️ THE FIELD DOES NOT MOVE, AND IT DID FOR ONE DAY. It drifted against the
      ground on the theory that two layers at different rates read as depth,
      which is true of photographs and false of HAIRLINES: `cloth` is a field of
      one-pixel strokes, and translating and scaling it by fractions of a pixel
      resamples every one of them on every frame. Measured off the recording, on
      a screen with nothing happening — the background strobed between four
      discrete brightness levels, up to eleven levels frame to frame. That is
      what "the ambience flickers" was.

      ⚠️ SO THE GROUND DRIFTS AND THE FIELD BEATS, and that is the whole division.
      A gradient can be resampled all day because it has no edges to alias; marks
      have edges, so they move by ROTATING IN PLACE inside the tile (`render`),
      which redraws the pattern rather than resampling the picture of it.

      ⚠️ AND ONE FULL-VIEWPORT LAYER ANIMATES INSTEAD OF TWO. On a phone the
      second one was not free: a masked, blended, viewport-sized surface
      re-rasterised at 60fps beside another one is most of a frame budget spent
      on something nobody is looking at.
    */
    /* ⚠️ AND NO `will-change` HERE. Nothing animates this element any more, and a
       promotion hint on a viewport-sized masked layer is a permanent compositing
       layer held in memory for a movement that does not happen. */

    /*
      THE SOURCE, AND IT IS THE ONE THING IN A SCENE THAT MOVES.
      ⚠️ ABOVE THE DITHER, WHICH IS THE WHOLE REASON IT IS A LAYER OF ITS OWN.
      The grain is `mix-blend-mode: overlay`, and a blended layer cannot be
      composited apart from what it blends with — so anything animating UNDER it
      drags a viewport-sized stack onto the main thread and re-blends it sixty
      times a second, which is what killed the ground's old drift. Out from under
      it, a transform and an opacity are compositor-only and cost one layer.

      ⚠️ AND IT DOES NOT NEED THE DITHER. What bands on an 8-bit display is a
      SHALLOW ramp over a large area; a family only puts its band here, which is
      steep by construction (`Ground`). The bloom around it — which is shallow,
      and would band — stays in the ground where the grain can reach it.

      ⚠️ `FADE` RATHER THAN `MATTE`, AND THAT IS A DESIGN DECISION RATHER THAN AN
      OMISSION. The matte hollows an ellipse down the reading column so a WORLD
      does not run under a paragraph; a band is a few percent of the width and is
      exactly what a screen leading with one figure wants passing behind it. The
      vertical ramp still applies, so it is gone by the time anybody has scrolled
      a screen, like everything else.
    */
    `[data-flare] {`,
    `  position: absolute; top: 0; left: 0; right: 0; width: 100%;`,
    `  height: ${REACH}; z-index: -1; pointer-events: none;`,
    `  background-image: var(--world-flare, none);`,
    `  background-size: cover; background-repeat: no-repeat;`,
    `  border-radius: inherit;`,
    `  ${LIGHT};`,
    `}`,
    /*
      ⚠️ EARNED, NOT DEFAULT — `data-lively` is set by `useScenery` from the same
      budget the field's beats answer to (`motionFor`), so a device that has not
      earned ambient motion gets a still light rather than no light.

      ⚠️ A ROTATION AND A BREATH, AND NOTHING ELSE. Both are compositor-only. The
      rotation is a degree and a half around the element's own centre, which
      moves a band whose source is far off the page by a long way — a light that
      travels rather than a picture that spins.

      ⚠️ THE OVERSCAN IS WHAT THERE IS TO ROTATE. A layer that exactly covers its
      box uncovers a corner the moment it turns, and an uncovered corner on a
      black ground is a visible wedge.

      ⚠️ AND IT IS SLOW ENOUGH TO BE UNCATCHABLE. Ninety seconds end to end,
      `alternate`, so there is no jump back — a ground that draws the eye is a
      ground that has failed, and the whole value of this is that somebody
      notices the screen is alive without ever seeing it move.
    */
    `[data-flare][data-lively="true"] {`,
    `  will-change: transform, opacity;`,
    `  animation: scene-flare ${DURATION.breath} ${EASE.settle} infinite alternate;`,
    `}`,
    `@keyframes scene-flare {`,
    `  from { transform: rotate(-0.9deg) scale(1.06); opacity: 0.72; }`,
    `  to { transform: rotate(1.5deg) scale(1.12); opacity: 1; }`,
    `}`,
    /*
      ⚠️ OFF BOTH WAYS, AND EITHER ALONE LEAVES HALF THE PEOPLE WHO ASKED STILL
      WATCHING IT. The media query is the operating system's answer; the ancestor
      is the switch a person can reach inside the app. For some people this is not
      a preference.
    */
    `@media (prefers-reduced-motion: reduce) {`,
    `  [data-flare][data-lively="true"] { animation: none; will-change: auto; }`,
    `}`,
    `[data-reduce-motion="true"] [data-flare][data-lively="true"] {`,
    `  animation: none; will-change: auto;`,
    `}`,
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
      ⚠️ THE GROUND DOES NOT DRIFT, AND REMOVING THAT IS THE PERFORMANCE FIX.
      `mix-blend-mode` on the grain below blends it with its backdrop, and a
      blended layer cannot be composited apart from what it blends with — so an
      animating gradient underneath drags the whole viewport-sized stack onto the
      main thread and re-blends it sixty times a second, for a wash sliding two
      percent over twenty-four seconds. On a phone that is most of a frame budget
      spent on the least perceptible motion in the product.

      ⚠️ AND THE CHOICE WAS BETWEEN THE DITHER AND THE DRIFT, so it went to the
      dither. The grain is not decoration: a large smooth gradient BANDS on an
      8-bit display, and the banding is the clearest tell of a cheap background —
      `overlay` is what makes noise dither rather than wash, and at three percent
      `normal` would lift every dark in the picture. What the world loses is a
      movement nobody could see; what it keeps is the reason it looks lit.

      ⚠️ SO THE ONLY THING THAT MOVES IN A SCENE IS A MARK. It rotates or breathes
      inside its own tile, which redraws the pattern rather than resampling a
      picture of it — see `render`. That is also the motion somebody asked for:
      the tiles, not the wash.
    */
    `[data-sky]:not([data-sky="plain"])::before,`,
    `[data-sky]:not([data-sky="plain"])::after {`,
    `  content: ""; position: absolute; top: 0; left: 0; right: 0;`,
    /*
      ⚠️ FOUR LAYERS, STACKED EXPLICITLY, AND THE ORDER IS THE PERFORMANCE
      DECISION. Ground, field, dither, source — all negative, so all of them are
      under the page's content whatever an ancestor does. What matters is that
      the SOURCE is above the dither: the grain is `mix-blend-mode`, and anything
      animating below a blend re-blends the whole viewport-sized stack every
      frame. Everything under it is dithered and still; the one thing above it is
      steep enough not to need dithering and is the only thing that moves.
    */
    `  height: ${REACH}; bottom: auto; z-index: -4;`,
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
    `  z-index: -2;`,
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
    /*
      ⚠️ AND THE HOVER IS FOR A POINTER THAT CAN HOVER, WHICH IS NOT EVERY ONE. A
      touch screen has no hover state to leave: the browser fires one on tap and
      the element keeps it until something else is tapped, so a chip somebody
      pressed stays a shade brighter than the four beside it for as long as they
      read the screen — a fixed bar wearing a selection nobody made. Every hover
      HeroUI draws is already inside this query; a hand-written rule is the only
      place the product can get it wrong, and this was the only one.
    */
    `@media (hover: hover) and (pointer: fine) {`,
    `  [data-chrome="true"]:hover {`,
    `    background-color: color-mix(in oklab,`,
    `      var(--surface-tertiary) 90%, var(--scene-veil, var(--surface-tertiary))) !important;`,
    `  }`,
    `}`,
    /*
      THE LIGHT LANDS ON THE THINGS STANDING IN IT.
      ⚠️ A GROUND REACHES THE PAGE AND STOPS THERE, WHICH IS WHY EVERY WORLD
      BEFORE THIS ONE READ AS WALLPAPER. The gradient is beautiful and the card
      on top of it is the same grey it is on a screen with no world at all, so
      what somebody sees is a working interface with a picture behind it rather
      than an interface in a room. A phone's home screen is mostly surfaces; if
      the surfaces do not take the light, almost nothing does.

      ⚠️ THE FAMILY DECIDES, AND MOST FAMILIES DECLINE. `Family.wash` is absent
      on seven of the eight — a quiet world is quiet on purpose, and washing a
      settings screen in a hue is the "ambience everywhere is ambience nowhere"
      failure with a bigger brush. The attribute is set only where a family
      published one, so a page can never be half-washed by a fallback.

      ⚠️ AND IT IS ONE RULE HERE RATHER THAN A PROP ON A CARD. A component that
      took a tint would be a component every screen could tint differently, which
      is the thing the whole token system exists to prevent — and the mono rule
      (`ground.test.mjs`) stays true, because nothing is writing a colour: the
      value is the world's, mixed into the tier the palette already chose.

      ⚠️ THE TIERS KEEP THEIR ORDER, WHICH IS THE PART THAT IS EASY TO BREAK. A
      card must still read as raised against the page and a chip as raised
      against a card; washing them by the same amount from a common colour
      collapses the three into one flat field. So the share rises with the tier —
      a surface barely, a card some, a control most — which is also what really
      happens to a lit room.

      ⚠️ AND IT WASHES THE TOKENS, NOT A LIST OF SELECTORS, WHICH IS THE WHOLE
      MECHANISM. Naming `.card` and two attributes reached three things and left
      every other painted surface in the library grey on a lit page — a quick
      action's circle, a progress track, a switch, a field, a chip, a segmented
      control. The library builds all of them out of SIX tokens, and measured
      across the built stylesheet every control token in it —
      `--switch-control-bg`, `--input-bg`, `--chip-bg`, `--select-trigger-bg`,
      `--checkbox-control-bg`, `--badge-bg`, `--textarea-bg`, the progress track,
      `.button--tertiary` — resolves to `--default` and to nothing else. So the
      wash is six declarations and it is complete by construction: a component
      the library adds next year is lit the day it ships, and one that paints a
      colour of its own is the only thing that can miss (`ground.test.mjs`).

      ⚠️ THE SOURCE IS `--tier-*`, NEVER THE TOKEN BEING WRITTEN. A custom
      property defined in terms of itself is a cycle at any depth, so
      `--surface-secondary: color-mix(…, var(--surface-secondary))` computes to
      nothing at all — silently, with the page still rendering. `ground.ts`
      states each tier's unwashed value once under a `--tier-` name and aliases
      the library's token to it; this mixes from the alias.

      ⚠️ AND THE PAGE ITSELF IS NOT WASHED. `--background` is what the scene is
      painted ON, so tinting it would be washing the light with its own colour.
    */
    /*
      ⚠️ AND THE SHARES CAME DOWN, BECAUSE A CONTROL AT 26% IS NOT LIT — IT IS
      PAINTED. The ladder was tuned as light landing on a grey palette, and it is
      mixing into tiers that ALREADY carry the brand (`TINT`, `CONTROL_TINT`) —
      so a field on a lit page was a quarter of the workspace's hue on top of a
      tinted grey, which on an amber deployment is a brown slab. Measured against
      the OLED ground it is worse, not better: the darker the tier, the further
      the same share moves it.

      ⚠️ THE ORDER IS WHAT MATTERS AND IT IS UNCHANGED — a surface barely, a card
      some, a control most. What changed is the top of the range, so a control is
      still the most-lit surface on the page and is no longer the most COLOURED
      thing on it.

      ⚠️ AND `--accent-soft` IS DELIBERATELY NOT IN THIS BLOCK. It is the one fill
      that is already mostly brand (`CHOSEN_TINT`), so washing it would be lighting
      a colour with itself — and the whole reason the shares above have a ceiling
      is to keep the unchosen controls from out-colouring the chosen one.
    */
    /*
      ⚠️ AND THE SHARES HALVED AGAIN WHEN THE TIERS STARTED CARRYING THE HUE
      THEMSELVES. For as long as a product's colour reached only the page element,
      every `--tier-*` resolved on `:root` against the deployment's neutral and
      this block was the ONLY place the product's colour touched a surface — so it
      had been tuned upward until it could carry that on its own, at 26%. With the
      hue on the document (`PageProps.hue`) the tiers are already made of it, and
      the two stacked: the amber arrived twice and the second dose was the one
      that read as brown.

      ⚠️ WHAT IS LEFT IS THE JOB THIS BLOCK ACTUALLY HAS — a LIT page differing
      from an unlit one. Not "the surfaces have a colour", which is the palette's,
      but "this screen is standing in a light".
    */
    `[data-wash="true"] {`,
    `  --surface: color-mix(in oklab, var(--scene-wash) 4%, var(--tier-base));`,
    `  --surface-secondary: color-mix(in oklab, var(--scene-wash) 6%, var(--tier-card));`,
    `  --surface-tertiary: color-mix(in oklab, var(--scene-wash) 9%, var(--tier-raised));`,
    `  --overlay: color-mix(in oklab, var(--scene-wash) 9%, var(--tier-raised));`,
    `  --field-background: color-mix(in oklab, var(--scene-wash) 10%, var(--tier-field));`,
    `  --default: color-mix(in oklab, var(--scene-wash) 10%, var(--tier-control));`,
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
    /*
      ⚠️ THE PLATE, AND IT IS THE ONE SURFACE IN THE PRODUCT THAT IS THE SAME IN
      BOTH THEMES. See `DOCK` in `ground.ts` for why the dock is not on the
      elevation ladder. What it buys the rules below is an ink that does not
      depend on the theme: everything inside a dark plate is light, so the four
      channels here — resting, active, muted, lit — are four numbers instead of
      eight.

      ⚠️ ITS INK IS SET ON THE PLATE, NOT ON THE ITEMS. A glyph in it inherits;
      an item that needs to differ overrides. Painting each button instead is how
      a control added later comes out in the page's ink on a near-black plate,
      which is invisible rather than merely wrong.
    */
    `[data-island="true"] {`,
    `  background-color: var(--tier-dock); color: var(--dock-ink);`,
    `  border-radius: 9999px; }`,
    /* ⚠️ THE PLATE'S OWN INK, NOT `--muted`. That token is calibrated against the
       PAGE's ground and is a near-black in the light theme — on the plate it is
       a glyph nobody can see. An alpha on the dock's own ink follows the plate
       instead, in both themes, under every workspace. */
    `[data-island="true"] button:not([data-here="true"]):not([data-act="true"]) {`,
    `  color: color-mix(in oklab, var(--dock-ink) 62%, transparent); }`,
    /*
      ⚠️ WHERE YOU ARE IS INK, AND THAT ONLY BECAME POSSIBLE WITH THE HEM. This
      painted `--default` — the control tier — and it had to: the bar under it
      was a filled capsule, so the answer to "where am I" needed a surface that
      clears the surface it sits on. With no bar there is nothing to clear, and a
      lozenge inside nothing is a shape drawn round a word for its own sake: one
      more edge, in a system that spent a whole pass removing them.
    */
    `[data-island="true"] [data-here="true"] { color: var(--dock-ink); }`,
    /*
      GLASS — AND IT IS THE THIRD CASE, NOT AN EXCEPTION BEING RE-ARGUED.

      ⚠️ THE RULE IT SITS BESIDE IS "GLASS IS FOR CHROME, AN IN-FLOW CONTROL IS
      OPAQUE" (`QuickActions`), and both halves of that are still right. A chip
      that scrolls with the page has nothing moving behind it, so the blur buys
      nothing and the translucent grey reads as grime on a coloured ground. What
      neither half covers is a control standing ON A PHOTOGRAPH: opaque, it is a
      grey blob hiding the picture it is about; painted from the tier ladder, its
      legibility depends on what somebody happened to upload.

      ⚠️ SO IT IS THE DOCK'S MATERIAL AT LOWER OPACITY, WHICH IS WHY IT LIVES
      HERE. Dark plate, light ink, both themes — because what is behind it is not
      the theme, it is an image nobody chose. Reusing `--tier-dock` is the point
      rather than a coincidence: the product has ONE plate, and glass is that
      plate seen through.

      ⚠️ AND THE BLUR IS EARNED HERE AND NOWHERE ELSE. It is the one surface with
      genuinely unknown content under it, and the reason the chrome's blur was
      removed — a repaint on every scroll beat, over the whole bar — does not
      apply to a control the size of a thumb that does not move.
    */
    `[data-glass="true"] {`,
    /* ⚠️ THE RADIUS IS HERE RATHER THAN ON THE CONTROL, for the same reason the
       plate's is: a `className` on a library component is a restyle (D7), and
       the shape of this material is a property of the material. */
    `  border-radius: 9999px;`,
    /* ⚠️ 74% IS A MEASUREMENT, NOT A TASTE. At 58 the plate over a pale
       photograph composited to rgb(125,124,121) and the caption on it measured
       3.82:1 — under the floor, on the one surface whose backdrop is an image
       nobody chose, which is exactly the case the tier ladder cannot answer. The
       share has to be enough that the WORST backdrop (white) still clears 4.5,
       and white is the worst backdrop; everything darker only helps. */
    `  background-color: color-mix(in oklab, var(--tier-dock) 74%, transparent);`,
    `  color: var(--dock-ink);`,
    `  backdrop-filter: blur(12px) saturate(1.3);`,
    `  -webkit-backdrop-filter: blur(12px) saturate(1.3); }`,
    /* ⚠️ A PRESS IS DENSER GLASS, NOT A DIFFERENT COLOUR. The plate is the same
       material throughout; what changes under a thumb is how much of the picture
       survives it. */
    `[data-glass="true"]:hover { background-color: color-mix(in oklab, var(--tier-dock) 84%, transparent); }`,
    `[data-glass="true"][data-pressed="true"] { background-color: color-mix(in oklab, var(--tier-dock) 92%, transparent); }`,
    /*
      ⚠️ THE ONE PLACE A PRODUCT'S OWN COLOUR TOUCHES THE CHROME, AND IT IS A
      LIGHT RATHER THAN A SURFACE. The bar carries no fill by design — every
      plate and pill it used to have was removed, and each was removed for a
      measured reason. What it had left was no material at all: four grey glyphs
      and one white one on the page's own ground, which is honest and reads as
      unfinished.

      ⚠️ SO THE ACTIVE ITEM IS LIT, NOT FILLED. `--brand` is the product's
      declared hue (`AppSpec.hue`), already on the element the ground is painted
      on, so this needs nothing passed down and nothing hardcoded: OneInventory's
      amber, and a true neutral where the deployment's own mono brand applies —
      which is correct, not a fallback. A deployment with no colour of its own
      gets a lift rather than a tint.

      ⚠️ IT SITS UNDER THE GLYPH AND NOWHERE NEAR THE WORD. Two reasons and both
      are measured: the contrast reading composites every translucent layer above
      the text, so a wash under the label changes the ground the one word on the
      bar is read against; and a glow spanning the whole open item is a pill with
      soft edges, which is the shape this design removed.

      ⚠️ `closest-side` AND NO BLUR. A `filter: blur()` promotes a layer and
      repaints it on every frame of the travel, on the one control that is on
      screen for the whole session — the gradient IS the blur, for nothing.
    */
    /*
      ⚠️ ONE STRENGTH NOW, AND THE PLATE IS WHY. This was two numbers, and the
      reason was sound: on black a warm halo ADDS luminance and reads as
      something lit, while on cream the same mix subtracts it and reads as a
      stain — so a single value came out looking like highlighter in the light
      theme. The light theme no longer has cream under this mark. The dock is
      dark on both grounds (`DOCK` in `ground.ts`), so the halo is doing the
      same thing in both, and the second number would now be the wrong one
      twice.
    */
    `[data-island="true"] { --nav-lit: 34% }`,
    `[data-island="true"] button[data-here="true"] { position: relative }`,
    `[data-island="true"] button[data-here="true"]::before {`,
    `  content: ""; position: absolute; z-index: 0;`,
    /* ⚠️ ANCHORED TO THE GLYPH, WHICH IS THE LEFT OF AN OPEN ITEM RATHER THAN
       its middle — a light centred on a pill that has a word in it sits under
       the word. `ISLAND_HERE` is `px-4`, so 1rem in plus half a nav glyph. */
    `  inset-block: 50%; inset-inline-start: calc(1rem + ${ICON.nav / 2}px);`,
    `  width: 0; height: 0; overflow: visible; pointer-events: none;`,
    `  box-shadow: 0 0 0 0 transparent;`,
    `  background: radial-gradient(closest-side,`,
    `    color-mix(in oklab, var(--brand) var(--nav-lit), transparent), transparent);`,
    `  padding: ${GLOW}px; margin: -${GLOW}px;`,
    `}`,
    /* ⚠️ IT ARRIVES WITH THE WORD AND LEAVES WITH IT — the same asymmetry
       `MOTION.unfold` and `MOTION.fold` describe. A light that faded on its own
       clock is a second thing happening during one movement. */
    `[data-island="true"] button::before { opacity: 0; transition: ${MOTION.unlit} }`,
    `[data-island="true"] button[data-here="true"]::before {`,
    `  opacity: 1; transition: ${MOTION.lit} }`,
    /* ⚠️ AND THE GLYPH STAYS ABOVE ITS OWN LIGHT. Without a stacking context on
       the content the gradient paints over the mark it is meant to be behind. */
    `[data-island="true"] button > * { position: relative; z-index: 1 }`,
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
    /*
      ⚠️ ONE RADIUS FOR EVERY SURFACE ON THE PAGE, AND IT IS THE CARD'S OWN
      EXPRESSION RATHER THAN A NUMBER BESIDE IT. `.card` is
      `min(32px, var(--radius-3xl))`; a `.button--md` is 36, so a grid of tiles
      sat beside a card at two different curvatures — measured, 36 against 32,
      which is not a difference anybody can name and is exactly why it reads as
      carelessness.

      ⚠️ AND IT IS `SURFACE_RADIUS` HERE RATHER THAN A LITERAL, because the card
      is the one that must not be chased: if the library changes its clamp, one
      constant moves and the tile follows it.
    */
    `[data-tile="true"] {`,
    `  --button-bg: var(--surface); --button-bg-hover: var(--surface-tertiary);`,
    `  border-radius: ${SURFACE_RADIUS}; }`,
    /*
      ⚠️ A PICTURE THAT LEADS A CARD TAKES THE CARD'S TOP CORNERS. It bleeds to
      the card's edges (`CARD_LEAD`), and the card does not clip its children —
      so a square-cornered image sat inside a 32px curve and its two top corners
      stuck out of it. Measured: `border-radius: 0px` on a 326×176 image inside a
      326-wide card at 32.

      ⚠️ THE BOTTOM TWO STAY SQUARE, because rows follow. A fully rounded picture
      with a row under it is a picture floating in a card rather than the card
      leading with it.
    */
    `[data-media="true"] {`,
    `  border-top-left-radius: ${SURFACE_RADIUS};`,
    `  border-top-right-radius: ${SURFACE_RADIUS}; }`,
    /*
      ⚠️ THE CHIP A ROW'S MARK SITS IN. It is here rather than on the component
      for the same reason the dot is: a component that named a colour would be
      one a workspace's branding never reaches (D7). `foreground` at seven
      percent is a fill that works on a card in either theme without knowing
      which theme it is in.
    */
    `[data-chip="true"] { background-color: color-mix(in oklab, var(--foreground) 7%, transparent); }`,
    /*
      ⚠️ THE SWITCH'S THUMB CARRIES NOTHING, AND THAT IS A REVERSAL. It held a
      tick for a while — always drawn, its opacity answering "am I on", because
      React Aria's thumb hands its state to no child. Every part of that worked
      and the control was worse for it: the library's own switch is a shape the
      whole world already reads, and a glyph inside a 20px knob is a second thing
      to notice on a control whose entire job is to be noticed once.
    */
    /*
      ⚠️ ONE OPTICAL WEIGHT FOR EVERY GLYPH IN THE PRODUCT. An icon library takes
      its size from its own props, so one caller passing nothing draws at the
      library default beside one that passed 20 — and a list with two icon sizes
      is the single most visible sign of a surface nobody owns. Setting it on the
      BOX means a caller cannot get it wrong.
    */
    /*
      ⚠️ A DESCENDANT, NOT A CHILD, AND THE `>` IS WHY THE WHOLE LADDER WAS
      INERT. `glyphOf` returns the mark inside its own `<span>`, so the tree is
      `span[--icon] > span > svg` and this rule matched nothing — anywhere, ever.
      Every glyph in the product drew at HeroUI's own 20px, the six sizes `ICON`
      publishes reached none of them, and nothing could report it: the variable
      really is set on the box, the value really is on the ladder, and the only
      way to see the fault is to measure a rendered mark.
    */
    `[style*="--icon"] svg { width: var(--icon); height: var(--icon); }`,
    `[style*="--icon"] svg { stroke-width: 1.75; }`,
  ].join("\n");
}
