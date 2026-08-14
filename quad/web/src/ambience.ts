/**
 * WHAT SITS BEHIND A SCREEN — gradients, patterns and texture, all derived from
 * the accent.
 *
 * ⚠️ NAMED, NEVER A COLOUR (D7). Each ambience is a SHAPE; the hue comes from
 * whatever the workspace's accent is at the time. A screen that named a colour
 * would stop matching the moment somebody changed their brand, and nobody would
 * connect the two.
 *
 * ⚠️ AND A PATTERN IS CSS, NOT AN IMAGE. A texture shipped as a PNG is bytes on
 * every cold load, a second asset to cache-bust, and — the part that matters — a
 * fixed colour, so it cannot follow a tenant's accent. Every pattern here is
 * built from `repeating-linear-gradient` and `radial-gradient`, which cost
 * nothing, scale to any density, and are tinted by a token.
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
  "mask-image: linear-gradient(180deg, black 0%, black 45%, transparent 100%); " +
  "-webkit-mask-image: linear-gradient(180deg, black 0%, black 45%, transparent 100%)";

/** The background layer for one ambience, as CSS declarations. */
export function ambienceCss(what: Ambience, tone: Tone = "neutral"): string {
  const hue = HUE[tone];
  switch (what) {
    case "plain":
      return "";

    case "calm":
      return `background-image: radial-gradient(120% 80% at 50% -20%, ${mix(hue, 18)} 0%, transparent 60%)`;

    case "focus":
      return `background-image: radial-gradient(60% 50% at 50% 40%, ${mix(hue, 12)} 0%, transparent 70%)`;

    case "lift":
      return `background-image: linear-gradient(180deg, transparent 30%, ${mix(hue, 14)} 100%)`;

    /* Two offset washes rather than one, so the eye has somewhere to travel. */
    case "mesh":
      return "background-image: " + [
        `radial-gradient(80% 60% at 12% 0%, ${mix(hue, 20)} 0%, transparent 60%)`,
        `radial-gradient(70% 55% at 92% 12%, ${mix(hue, 12)} 0%, transparent 62%)`,
      ].join(", ");

    /*
      ⚠️ A DOT FIELD FROM TWO GRADIENTS, NOT AN IMAGE. `background-size` sets the
      density and the accent tints it, so the same declaration is a fine mesh on
      a phone and a coarse one on a wall display without a second asset.
    */
    case "dots":
      return [
        `background-image: radial-gradient(${mix(hue, 55)} 1px, transparent 1px)`,
        `background-size: 14px 14px`,
        `background-position: 0 0`,
      ].join("; ");

    /* Fine diagonal threading. Two passes at opposing angles reads as woven
       rather than as stripes. */
    case "weave":
      return [
        "background-image: " + [
          `repeating-linear-gradient(45deg, ${mix(hue, 10)} 0 1px, transparent 1px 6px)`,
          `repeating-linear-gradient(-45deg, ${mix(hue, 7)} 0 1px, transparent 1px 6px)`,
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
    `  content: ""; position: absolute; inset: 0; z-index: -1;`,
    `  pointer-events: none; background-repeat: repeat;`,
    `}`,
    ...rules,
    /* ⚠️ A bleeding ambience must reach the edge even inside a padded column. */
    `[data-bleed="edge"]::before { left: 50%; right: auto; width: 100vw; transform: translateX(-50%); }`,
  ].join("\n");
}
