/**
 * A TENANT'S BRANDING BECOMES TOKENS, AND EVERY COMPONENT ADAPTS (D7).
 *
 * ⚠️ THE COMPONENT LIBRARY IS NOT RESTYLED. HeroUI v3 reads its colours, radius
 * and type from CSS variables, so a workspace's brand is a handful of variable
 * values and nothing else changes — no screen knows a tenant has branding, and
 * no component has a per-tenant variant. The alternative, letting a workspace
 * supply CSS, hands them the ability to break their own customers' screens on
 * our infrastructure and to make a page look like something it is not.
 *
 * ⚠️ AND THE SKY IS DERIVED FROM THE SAME TOKENS. A page declares its ambience
 * by NAME — `calm`, `focus`, `lift` — never by colour, so the gradient behind
 * every screen follows the brand automatically. A page that named a colour would
 * be a page that stops matching the moment somebody changes their accent.
 */

import type { Theme, Tone } from "@engine/kernel";
import { contrast, luminance } from "@engine/kernel";
import { MOTION } from "./motion.js";

/* ------------------------------------------------------------------ tokens --- */

/**
 * ⚠️ THESE ARE HEROUI'S OWN VARIABLE NAMES, NOT NAMES OF OURS MAPPED ONTO THEM.
 * A translation table goes stale the first time the library adds a token, and a
 * token that maps to nothing changes nothing — visibly, on somebody's brand.
 */
const TOKENS = {
  /*
    ⚠️ A WORKSPACE'S COLOUR IS `--brand`, NOT `--accent`, AND THAT IS THE WHOLE
    SPLIT. `--accent` is what the library paints controls with and it is
    MONOCHROME now — see `ground.ts`. A brand lands on the ground those controls
    sit on: the page, the surfaces, the ambience. The tenant still recognises
    their product; the interface stays a set of values, so the only colour on a
    screen is one that means something.

    ⚠️ AND IT REMOVES A WHOLE CLASS OF FAILURE. While a tenant chose the accent,
    every primary button in the product was a colour we had never seen, so
    contrast on the one control people press was a thing we clamped and hoped
    for. A ground tint at five percent cannot be unreadable.
  */
  brand: "--brand",
  ground: "--background",
  ink: "--foreground",
  radius: "--radius",
  font: "--font-sans",
} as const;

const RADIUS: Readonly<Record<NonNullable<Theme["radius"]>, string>> = {
  none: "0rem", sm: "0.25rem", md: "0.5rem", lg: "0.875rem", full: "9999px",
};

/**
 * The CSS a workspace's branding amounts to.
 *
 * ⚠️ ONE DECLARATION BLOCK, ON `:root`, AND NOTHING ELSE. Anything wider is a
 * stylesheet a tenant controls; anything narrower and half the components miss
 * it. Returned as text rather than applied, because who applies it — a server
 * rendering the page, a preview updating on every keystroke — is not this
 * module's business.
 */
export function brandCss(theme: Theme): string {
  const lines: string[] = [];
  const put = (name: string, value: string) => lines.push(`  ${name}: ${value};`);

  if (theme.accent) put(TOKENS.brand, theme.accent);
  if (theme.ground) put(TOKENS.ground, theme.ground);
  if (theme.ink) put(TOKENS.ink, theme.ink);
  if (theme.radius) put(TOKENS.radius, RADIUS[theme.radius]);
  if (theme.font) put(TOKENS.font, theme.font);

  /*
    ⚠️ THERE IS NO `--accent-foreground` TO DERIVE ANY MORE, and its absence is
    the point. It existed because a workspace's colour was the fill of every
    primary button, so the text on it had to be computed from a hue nobody had
    seen. The accent is monochrome and ours now; the pair is fixed in
    `ground.ts` and cannot be got wrong by anybody's choice.
  */
  return lines.length ? `:root {\n${lines.join("\n")}\n}` : "";
}

/**
 * ⚠️ BOTH THEMES, OR THE DARK ONE INHERITS A LIGHT BRAND. A workspace that set a
 * pale ground and left dark alone would have their customers reading dark text
 * on a dark background — which they will never see, because they set it on their
 * own screen in daylight.
 */
export function brandCssFor(light: Theme, dark?: Theme): string {
  const one = brandCss(light);
  if (!dark) return one;
  /* ⚠️ `[data-theme="dark"]` WITHOUT `:root`, SO THE THEME IS SCOPABLE. Bound to
     the document element these tokens could only ever switch for the whole page
     — and one screen legitimately wants to be a dark room inside a light app
     (`Page`'s `world`). The library's own tokens are already written this way
     (`.dark, [data-theme=dark]`); ours were the half that could not follow. */
  const other = brandCss(dark).replace(/^:root/, `[data-theme="dark"]`);
  return `${one}\n${other}`;
}

/* -------------------------------------------------------------------- sky --- */

/*
  ⚠️ THERE WAS A `SKY_MOTION` HERE AND IT MOVED NOTHING. It sized, repeated and
  drifted a background-image on the `[data-sky]` element — three rules and a
  24-second transition on a property whose value, measured in the browser, is
  `none` on every skyed element in the product. The ground moved to the layer
  under the element (`::before`) when the scene engine was written, and the
  rules that used to drive it stayed behind, still shipping, still passing.

  ⚠️ THE DRIFT IS `one-drift`, IN `ambienceStylesheet`, on the layer that
  actually carries the ground — and it answers both reduced-motion switches
  there. A second drift here would have been two ambient motions on one world;
  what it was instead is a stylesheet nobody could tell was dead, because a rule
  that applies to nothing looks exactly like a rule that applies.
*/

/**
 * ⚠️ OUR TONE, THEIR COLOUR NAME. A declaration says what HAPPENED — five tones,
 * no palette words (see `Tone`) — and this is the one place that becomes a
 * library colour. Screens naming a library colour directly would have to be
 * revisited the day the library renames one, and there are a lot of screens.
 */
export const colorFor = (tone: Tone): "accent" | "default" | "success" | "warning" | "danger" => {
  switch (tone) {
    case "neutral": return "default";
    case "info": return "accent";
    case "success": return "success";
    case "warning": return "warning";
    case "danger": return "danger";
  }
};

/* ------------------------------------------------------------------ rules --- */

/**
 * ⚠️ REFUSED, NOT WARNED ABOUT — and the kernel is where the rule lives, because
 * an unreadable pair is refused at the API too. This is the same check, at the
 * moment somebody is choosing, so the answer arrives while they can still act
 * on it.
 */
export const readable = (ink: string, ground: string): boolean =>
  (contrast(ink, ground) ?? 0) >= 4.5;
