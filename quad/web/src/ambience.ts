/**
 * WHAT SITS BEHIND A SCREEN — gradients, patterns and texture, all derived from
 * the accent.
 *
 * ⚠️ NAMED, NEVER A COLOUR (D7). Each ambience is a SHAPE; the hue comes from
 * whatever the workspace's accent is at the time. A screen that named a colour
 * would stop matching the moment somebody changed their brand, and nobody would
 * connect the two.
 *
 * ⚠️ A PATTERN IS BARELY THERE, AND THE FIRST VERSION OF THIS FILE GOT THAT
 * WRONG. `dots` and `weave` shipped at a strength where the repeat was plainly
 * visible across a whole screen — which does not read as texture, it reads as a
 * moiré or a rendering fault, and it was the single thing that made the product
 * look counterfeit. A texture is felt, never seen. The tints below are a third of
 * what they were, the repeat is finer, and both stop well before the fold.
 *
 * ⚠️ THEY ARE STILL CSS RATHER THAN IMAGES, for the reason that has not changed:
 * a PNG is bytes on every cold load and a FIXED colour, so it cannot follow a
 * tenant's accent.
 *
 * ⚠️ THE BLEED IS THE OTHER HALF. An ambience that stops at the crown's lower
 * edge draws a line across the page; one that fades has depth. `FADE` is the
 * mask that does it, and it is why the pattern is on its own layer rather than
 * on the element's background.
 */

import type { Tone } from "@quad/kernel";

/**
 * ⚠️ SEVEN, AND `plain` IS THE DEFAULT ON PURPOSE. Ambience everywhere is
 * ambience nowhere: the reason the patterned screens in a good product land is
 * that most screens are flat.
 *
 *   plain   nothing. Most screens.
 *   calm    one wide, slow wash. Where somebody arrives.
 *   focus   a tight vignette pulling the eye to the middle. One task.
 *   lift    a rising gradient. Something that just went well.
 *   mesh    two offset washes. A landing surface with room to breathe.
 *   dots    a fading dot field. Reads as "this area is technical" — security,
 *           devices, diagnostics.
 *   weave   fine diagonal threading. Reads as material and premium — a plan, a
 *           balance, anything about worth.
 */
export type Ambience = "plain" | "calm" | "focus" | "lift" | "mesh" | "dots" | "weave";

export const AMBIENCES: readonly Ambience[] = [
  "plain", "calm", "focus", "lift", "mesh", "dots", "weave",
];

/**
 * ⚠️ TONE SELECTS THE TOKEN, AMBIENCE SELECTS THE SHAPE. Keeping them apart is
 * what lets a warning-toned screen be calm and a success-toned one lift, without
 * anybody drawing thirty-five combinations by hand.
 */
const HUE: Readonly<Record<Tone, string>> = {
  neutral: "var(--accent)",
  info: "var(--accent)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
};

const mix = (hue: string, pct: number) =>
  `color-mix(in oklab, ${hue} ${pct}%, transparent)`;

/**
 * ⚠️ THE MASK IS WHY IT READS AS DEPTH RATHER THAN AS A PANEL. Without it every
 * patterned header ends in a hard horizontal edge, which is the single thing
 * that makes an ambient background look like a mistake.
 */
export const FADE =
  "mask-image: linear-gradient(180deg, black 0%, black 30%, transparent 100%); " +
  "-webkit-mask-image: linear-gradient(180deg, black 0%, black 30%, transparent 100%)";

/**
 * ⚠️ THE LAYER IS A BAND AT THE TOP, NOT THE WHOLE PAGE, AND THIS IS THE BUG THE
 * FADE HAD. Masked over `inset: 0` on a page taller than the screen, the ramp to
 * transparent lands somewhere past the fold — so the pattern stayed at full
 * strength for the entire visible screen and only faded on a page shorter than
 * the viewport, which is never. Ambience belongs to the top of a screen, where
 * the crown is; a height in `vh` is what makes the fade a thing anybody sees.
 */
export const REACH = "60vh";

/** The background layer for one ambience, as CSS declarations. */
export function ambienceCss(what: Ambience, tone: Tone = "neutral"): string {
  const hue = HUE[tone];
  switch (what) {
    case "plain":
      return "";

    case "calm":
      return `background-image: radial-gradient(120% 90% at 50% -30%, ${mix(hue, 14)} 0%, transparent 65%)`;

    case "focus":
      return `background-image: radial-gradient(70% 60% at 50% 25%, ${mix(hue, 10)} 0%, transparent 72%)`;

    case "lift":
      return `background-image: linear-gradient(180deg, ${mix(hue, 12)} 0%, transparent 70%)`;

    /* Two offset washes rather than one, so the eye has somewhere to travel. */
    case "mesh":
      return "background-image: " + [
        `radial-gradient(80% 70% at 10% -10%, ${mix(hue, 16)} 0%, transparent 62%)`,
        `radial-gradient(70% 60% at 95% 5%, ${mix(hue, 9)} 0%, transparent 64%)`,
      ].join(", ");

    /*
      ⚠️ A DOT FIELD FROM TWO GRADIENTS, NOT AN IMAGE. `background-size` sets the
      density and the accent tints it, so the same declaration is a fine mesh on
      a phone and a coarse one on a wall display without a second asset.
    */
    case "dots":
      return [
        /* ⚠️ 18% and 22px, from 55% and 14px. At the old values the grid was a
           thing you looked AT rather than a surface the screen sat on. */
        `background-image: radial-gradient(${mix(hue, 18)} 0.5px, transparent 0.5px)`,
        `background-size: 22px 22px`,
        `background-position: 0 0`,
      ].join("; ");

    /* Fine diagonal threading. Two passes at opposing angles reads as woven
       rather than as stripes. */
    case "weave":
      return [
        "background-image: " + [
          /* ⚠️ One pass, not two crossed ones — the crosshatch read as moiré. */
          `repeating-linear-gradient(45deg, ${mix(hue, 5)} 0 1px, transparent 1px 9px)`,
        ].join(", "),
      ].join("; ");
  }
}

/**
 * ⚠️ EVERY AMBIENCE, AS ONE STYLESHEET, WITH THE FADE AND THE MOTION ATTACHED.
 * Built once and injected, because the gradients are derived from the accent at
 * runtime — a workspace's brand has to reach the background of every screen
 * without any screen knowing that branding exists.
 *
 * The layer is a `::before` rather than the element's own background so the
 * mask can fade it without fading the content on top of it.
 */
export function ambienceStylesheet(): string {
  const rules = AMBIENCES.filter((a) => a !== "plain").map((a) => {
    const css = ambienceCss(a);
    return `[data-sky="${a}"]::before { ${css}; ${FADE}; }`;
  });

  return [
    /* ⚠️ `-1` and `isolation` on the host, or the layer paints over the content
       of any ancestor that happens to create a stacking context. */
    `[data-sky] { position: relative; isolation: isolate; }`,
    `[data-sky]:not([data-sky="plain"])::before {`,
    /* ⚠️ `bottom: auto` and a height — see `REACH`. `inset: 0` is what made the
       fade invisible on every page longer than a screen. */
    `  content: ""; position: absolute; top: 0; left: 0; right: 0;`,
    `  height: ${REACH}; bottom: auto; z-index: -1;`,
    `  pointer-events: none; background-repeat: repeat;`,
    `}`,
    ...rules,
    /* ⚠️ A bleeding ambience must reach the edge even inside a padded column. */
    `[data-bleed="edge"]::before { left: 50%; right: auto; width: 100vw; transform: translateX(-50%); }`,
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
