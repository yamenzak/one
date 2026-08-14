/**
 * WHAT SITS BEHIND A SCREEN — the ground, its light, its material and its grain.
 *
 * ⚠️ NAMED, NEVER A COLOUR (D7). Each ambience is a SHAPE OF LIGHT; the hue comes
 * from whatever the workspace's accent is at the time. A screen that named a
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

import type { Tone } from "@quad/kernel";

/**
 * ⚠️ TWELVE, AND `plain` IS STILL THE DEFAULT. Ambience everywhere is ambience
 * nowhere: the reason the rich screens in a good product land is that most
 * screens are flat. What earns a ground is a screen somebody ARRIVES at — a
 * balance, a home, a result — never a form and never a list.
 *
 *   plain      nothing. Most screens.
 *   calm       one wide, slow wash. Where somebody arrives.
 *   focus      a tight pool of light in the middle. One task.
 *   lift       light rising from below. Something that just went well.
 *   mesh       two offset poles. A landing surface with room to breathe.
 *   dots       a fading measure. Reads as technical — devices, diagnostics.
 *   weave      fine diagonal threading. Reads as woven cloth.
 *   drape      a fold of heavy fabric, lit from one side. The most material of
 *              them: worth, a plan, anything premium.
 *   aurora     several poles at different values with one companion hue. Alive
 *              and generous — a celebration, a milestone, a reward.
 *   veil       one broad diagonal sweep of light. Clean and directional; good
 *              under a single large figure.
 *   tide       two deep bands meeting on a soft horizon. Calm, wide, patient.
 *   spotlight  a hard light source with a long falloff and a heavy corner. The
 *              most staged — a single object, a single decision.
 */
export type Ambience =
  | "plain" | "calm" | "focus" | "lift" | "mesh" | "dots"
  | "weave" | "drape" | "aurora" | "veil" | "tide" | "spotlight";

export const AMBIENCES: readonly Ambience[] = [
  "plain", "calm", "focus", "lift", "mesh", "dots",
  "weave", "drape", "aurora", "veil", "tide", "spotlight",
];

/**
 * ⚠️ TONE SELECTS THE TOKEN, AMBIENCE SELECTS THE SHAPE. Keeping them apart is
 * what lets a warning-toned screen be calm and a success-toned one lift, without
 * anybody drawing sixty combinations by hand.
 */
const HUE: Readonly<Record<Tone, string>> = {
  neutral: "var(--accent)",
  info: "var(--accent)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
};

/**
 * ⚠️ EVERY STRENGTH IS SCALED BY `--sky`, AND THAT IS HOW LIGHT MODE SURVIVES.
 * The same mix that reads as a lit ground on a dark screen reads as a stain on a
 * white one — the eye judges a tint against the paper, not in the abstract. One
 * multiplier set per theme is the whole fix; the alternative is two hand-tuned
 * numbers per layer per ambience, which is forty numbers nobody will keep true.
 */
const mix = (hue: string, pct: number) =>
  `color-mix(in oklab, ${hue} calc(var(--sky, 1) * ${pct}%), transparent)`;

/** A soft pole of light: where, how wide, how strong. */
const pole = (hue: string, pct: number, x: string, y: string, w: string, h: string) =>
  `radial-gradient(${w} ${h} at ${x} ${y}, ${mix(hue, pct)} 0%, transparent 72%)`;

/**
 * ⚠️ THE VIGNETTE IS THE LAYER PEOPLE LEAVE OUT, AND IT IS THE ONE THAT MAKES A
 * GROUND LOOK LIT. Without it the corners are exactly as bright as the middle,
 * which never happens to a real surface and reads as "filled" rather than
 * "photographed". It pulls DOWN toward the page's own ground rather than to
 * black, so it works in both themes and under any brand.
 *
 * ⚠️ AND IT STARTS LATE, BECAUSE A VIGNETTE THAT STARTS EARLY IS NOT A VIGNETTE
 * — it is a wash over the whole ground, and the first version of it was exactly
 * that: opaque from 40% outward, which is most of a phone. It flattened every
 * pole underneath it and made `aurora` — four poles at four values — read as a
 * faint smudge. Frame the light; do not paint over it.
 */
const DEPTH =
  "radial-gradient(135% 115% at 50% 22%, transparent 62%, "
  + "color-mix(in oklab, var(--background) calc(var(--sky, 1) * 45%), transparent) 100%)";

/**
 * ⚠️ GRAIN IS DITHER, AND DITHER MUST BE NOISE. A wash this large bands into
 * visible steps on an ordinary display, and breaking the steps up needs
 * randomness — which a repeating gradient is the precise opposite of.
 *
 * ⚠️ THE FIRST VERSION OF THIS WAS TWO DOT FIELDS AT 3px AND 5px, AND IT WAS
 * VISIBLE AS A GRID. It was described here as "invisible on their own" and
 * shipped; on a near-white ground, dots of the foreground colour at three
 * percent are plainly there, and two pitches that close beat against each other
 * into a lattice — the exact fault the old `dots` ambience had, reintroduced by
 * the layer meant to hide it. It survived because it was only ever looked at
 * whole-page, in dark.
 *
 * ⚠️ SO IT IS `feTurbulence`, WHICH IS ACTUAL NOISE. Every pixel is independent,
 * so there is no pitch to beat against anything and nothing to see at any zoom.
 * `saturate 0` because the filter's raw output is coloured; `stitchTiles`
 * because without it the tile edges are a seam — a grid again, one repeat wider.
 */
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
export const FADE = (() => {
  const ramp = "linear-gradient(180deg, black 0%, black 45%, "
    + "color-mix(in oklab, black 55%, transparent) 72%, transparent 100%)";
  return `mask-image: ${ramp}; -webkit-mask-image: ${ramp}`;
})();

/**
 * ⚠️ ONE VIEWPORT, NOT A BAND — see the header. A ground that stops behind the
 * crown draws a line across the page; one that lasts a screen and fades has
 * depth, and is gone by the time anybody has scrolled past it.
 */
export const REACH = "100vh";

/** The layers of one ambience, innermost last, as `background-image` entries. */
function layers(what: Ambience, hue: string): readonly string[] {
  switch (what) {
    case "plain":
      return [];

    case "calm":
      return [
        pole(hue, 20, "50%", "-20%", "130%", "80%"),
        pole(hue, 10, "80%", "10%", "70%", "50%"),
      ];

    case "focus":
      return [
        pole(hue, 16, "50%", "22%", "70%", "55%"),
        pole(hue, 7, "50%", "0%", "120%", "40%"),
      ];

    case "lift":
      return [
        `linear-gradient(0deg, ${mix(hue, 22)} 0%, ${mix(hue, 6)} 40%, transparent 75%)`,
        pole(hue, 12, "50%", "95%", "110%", "60%"),
      ];

    case "mesh":
      return [
        pole(hue, 22, "8%", "-8%", "85%", "70%"),
        pole(hue, 14, "96%", "6%", "75%", "60%"),
        pole(hue, 8, "50%", "45%", "90%", "60%"),
      ];

    /*
      ⚠️ A MEASURE, NOT A DOT FIELD. The point of this one is that it says
      "technical" — so the dots sit on a wash rather than on nothing, which is
      what stopped the old version reading as a rendering fault.
    */
    case "dots":
      return [
        `radial-gradient(${mix(hue, 22)} 0.5px, transparent 0.5px)`,
        pole(hue, 14, "50%", "-10%", "120%", "70%"),
      ];

    /* Fine diagonal threading over a wash — cloth, not stripes. */
    case "weave":
      return [
        `repeating-linear-gradient(45deg, ${mix(hue, 6)} 0 1px, transparent 1px 9px)`,
        pole(hue, 18, "30%", "-10%", "110%", "70%"),
        pole(hue, 10, "90%", "40%", "70%", "60%"),
      ];

    /*
      ⚠️ THE FOLD IS A CONIC GRADIENT, AND NOTHING ELSE PRODUCES IT. A fold is a
      surface turning away from a light source — the brightness sweeps around a
      point rather than along a line, which is exactly what a conic sweep is and
      exactly what no combination of linear gradients can fake.
    */
    case "drape":
      return [
        `repeating-linear-gradient(38deg, ${mix(hue, 5)} 0 1px, transparent 1px 7px)`,
        /* ⚠️ EVERY ANGULAR STOP IS A RAMP, NEVER A JUMP. A conic gradient going
           straight from a tint to `transparent` draws a SEAM — a hard diagonal
           line across the screen that reads as a graphic, not as cloth. Cloth
           has no edges; a fold is a continuous change of angle, so every stop
           below has a neighbour a long way off rather than a stop beside it. */
        `conic-gradient(from 190deg at 22% -14%, `
          + `${mix(hue, 24)} 0deg, ${mix(hue, 13)} 48deg, ${mix(hue, 4)} 96deg, `
          + `${mix(hue, 15)} 168deg, ${mix(hue, 5)} 232deg, ${mix(hue, 20)} 306deg, `
          + `${mix(hue, 24)} 360deg)`,
        pole(hue, 20, "70%", "12%", "90%", "70%"),
      ];

    /*
      ⚠️ THE ONE AMBIENCE WITH A SECOND HUE, AND IT IS DECLARED RATHER THAN
      INVENTED. `--success` is the companion because it is the token furthest
      from the accent that every theme is guaranteed to define — so the pairing
      still follows a tenant's brand instead of freezing one screen on ours.
    */
    case "aurora":
      return [
        pole("var(--success)", 18, "18%", "8%", "70%", "55%"),
        pole(hue, 26, "78%", "-6%", "80%", "60%"),
        pole(hue, 14, "45%", "38%", "70%", "50%"),
        pole("var(--success)", 9, "88%", "45%", "60%", "45%"),
      ];

    /* One broad sweep, and a counter-sweep so the dark half is not flat. */
    case "veil":
      return [
        `linear-gradient(112deg, ${mix(hue, 30)} 0%, ${mix(hue, 12)} 34%, transparent 58%)`,
        `linear-gradient(292deg, ${mix(hue, 14)} 0%, transparent 45%)`,
        pole(hue, 10, "20%", "20%", "80%", "60%"),
      ];

    /* Two deep bands meeting on a soft horizon. */
    case "tide":
      return [
        `linear-gradient(180deg, ${mix(hue, 26)} 0%, ${mix(hue, 8)} 45%, transparent 70%)`,
        pole(hue, 16, "15%", "35%", "90%", "45%"),
        pole(hue, 12, "85%", "8%", "70%", "40%"),
      ];

    /*
      ⚠️ A LIGHT SOURCE AND A SHADOW, WHICH IS WHY THE CORNER IS HEAVY. Staging
      is direction: everything else here is lit from everywhere, and this one is
      lit from somewhere.
    */
    case "spotlight":
      return [
        pole(hue, 34, "72%", "-4%", "70%", "55%"),
        pole(hue, 12, "60%", "20%", "120%", "80%"),
        `linear-gradient(200deg, transparent 40%, `
          + `color-mix(in oklab, var(--background) calc(var(--sky, 1) * 45%), transparent) 100%)`,
      ];
  }
}

/**
 * The background layer for one ambience, as CSS declarations.
 *
 * ⚠️ DEPTH GOES ON TOP OF THE FORMS AND UNDER NOTHING ELSE — first in the list,
 * because `background-image` paints its first entry last. Putting the vignette
 * under the poles lets them light the corners it exists to darken.
 */
export function ambienceCss(what: Ambience, tone: Tone = "neutral"): string {
  const forms = layers(what, HUE[tone]);
  if (!forms.length) return "";
  return `background-image: ${[DEPTH, ...forms].join(", ")}`;
}

/**
 * ⚠️ EVERY AMBIENCE, AS ONE STYLESHEET, WITH THE FADE AND THE GRAIN ATTACHED.
 * Built once and injected, because the gradients are derived from the accent at
 * runtime — a workspace's brand has to reach the background of every screen
 * without any screen knowing that branding exists.
 *
 * ⚠️ TWO PSEUDO-ELEMENTS, AND THEY ARE NOT INTERCHANGEABLE. `::before` carries
 * the ground and is MASKED, so it fades. `::after` carries the grain and is NOT,
 * because dither that fades out stops dithering exactly where the gradient is
 * shallowest and banding is most visible.
 */
export function ambienceStylesheet(): string {
  const rules = AMBIENCES.filter((a) => a !== "plain").map((a) => {
    const css = ambienceCss(a);
    const sized = a === "dots"
      ? "; background-size: 22px 22px, auto"
      : "";
    return `[data-sky="${a}"]::before { ${css}${sized}; ${FADE}; }`;
  });

  return [
    /* ⚠️ `-1` and `isolation` on the host, or the layer paints over the content
       of any ancestor that happens to create a stacking context. */
    `[data-sky] { position: relative; isolation: isolate; --sky: 1; }`,
    /* ⚠️ SEE `mix` — one multiplier per theme, not forty hand-tuned numbers.
       Both selector forms, because the stamp may be on the host or an ancestor. */
    `[data-theme="light"] [data-sky], [data-theme="light"][data-sky] { --sky: 0.55; }`,
    `[data-sky]:not([data-sky="plain"])::before,`,
    `[data-sky]:not([data-sky="plain"])::after {`,
    `  content: ""; position: absolute; top: 0; left: 0; right: 0;`,
    `  height: ${REACH}; bottom: auto; z-index: -1;`,
    `  pointer-events: none;`,
    `}`,
    `[data-sky]:not([data-sky="plain"])::before { background-repeat: repeat; }`,
    /* ⚠️ The dither, unmasked — see the note above this function. */
    `[data-sky]:not([data-sky="plain"])::after {`,
    `  background-image: ${GRAIN};`,
    `  background-repeat: repeat;`,
    `  opacity: ${GRAIN_OPACITY};`,
    `  mix-blend-mode: overlay;`,
    `}`,
    ...rules,
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
    `[data-glass="true"] {`,
    `  background-color: color-mix(in oklab, var(--foreground) 10%, transparent) !important;`,
    `  backdrop-filter: blur(28px) saturate(1.8);`,
    `  -webkit-backdrop-filter: blur(28px) saturate(1.8);`,
    `}`,
    /*
      ⚠️ THE BAR IS A VEIL OF THE RAISED TIER, NOT A WASH OF THE FOREGROUND, and
      the difference is what makes it translucent rather than merely see-through.
      A foreground tint at any strength a person can see past is one you can
      READ past — the row under the nav came through it and collided with the
      labels, two sets of words in the same place, which is the fault this
      component has now had twice.

      ⚠️ AND IT CANNOT BE A VEIL OF `--background` EITHER, which is the obvious
      choice and the one that fails in the interesting place: over the page's own
      ground it would BE the ground, so the bar would vanish exactly where there
      is no card behind it. `--surface-tertiary` is the tier the palette
      guarantees clears both the page and a card, so a veil of it is separable
      wherever it lands — and eight percent of whatever is behind still comes
      through, blurred, which is the whole effect.
    */
    `[data-island="true"][data-glass="true"] {`,
    `  background-color: color-mix(in oklab, var(--surface-tertiary) 76%, transparent) !important;`,
    `  backdrop-filter: blur(36px) saturate(1.8);`,
    `  -webkit-backdrop-filter: blur(36px) saturate(1.8);`,
    `}`,
    /*
      ⚠️ THE PILL THAT MARKS WHERE YOU ARE, AS A RULE RATHER THAN A CLASS. It is
      one element that TRAVELS between four equal columns — see `Island` — so it
      needs a fill and a radius and nothing else. `--default` is the control
      tier, which the palette guarantees clears both the raised tier under it
      and the surfaces around it.
    */
    `[data-pill="true"] { background-color: var(--default); border-radius: 9999px; }`,
    `@media (prefers-reduced-motion: reduce) { [data-pill="true"] { transition: none !important; } }`,
    `[data-glass="true"]:hover {`,
    `  background-color: color-mix(in oklab, var(--foreground) 18%, transparent) !important;`,
    `}`,
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
