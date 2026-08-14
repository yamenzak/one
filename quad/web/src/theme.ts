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

import type { Theme, Tone } from "@quad/kernel";
import { contrast, luminance } from "@quad/kernel";

/* ------------------------------------------------------------------ tokens --- */

/**
 * ⚠️ THESE ARE HEROUI'S OWN VARIABLE NAMES, NOT NAMES OF OURS MAPPED ONTO THEM.
 * A translation table goes stale the first time the library adds a token, and a
 * token that maps to nothing changes nothing — visibly, on somebody's brand.
 */
const TOKENS = {
  accent: "--accent",
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

  if (theme.accent) put(TOKENS.accent, theme.accent);
  if (theme.ground) put(TOKENS.ground, theme.ground);
  if (theme.ink) put(TOKENS.ink, theme.ink);
  if (theme.radius) put(TOKENS.radius, RADIUS[theme.radius]);
  if (theme.font) put(TOKENS.font, theme.font);

  /*
    ⚠️ THE FOREGROUND ON THE ACCENT IS DERIVED, NOT ASKED FOR. A workspace picks
    one colour; asking them for the text colour that sits on it is asking a
    question most people answer wrongly, and the wrong answer is a button
    nobody can read.
  */
  if (theme.accent) {
    const l = luminance(theme.accent);
    if (l !== null) put("--accent-foreground", l > 0.55 ? "var(--eclipse)" : "var(--snow)");
  }

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
  const other = brandCss(dark).replace(/^:root/, `:root[data-theme="dark"]`);
  return `${one}\n${other}`;
}

/* -------------------------------------------------------------------- sky --- */

/**
 * WHAT SITS BEHIND A SCREEN.
 *
 * ⚠️ A NAME, NOT A COLOUR (see the header). Each of these is a shape and a
 * motion; the colour comes from whatever the accent is at the time.
 *
 *   plain  nothing. The default, and most screens should stay here — ambience
 *          everywhere is ambience nowhere.
 *   calm   one wide, slow wash. For the place somebody arrives.
 *   focus  a tight vignette that pulls the eye to the middle. For one task.
 *   lift   a rising gradient. For something that just went well.
 */
export type Sky = "plain" | "calm" | "focus" | "lift";

export const SKIES: readonly Sky[] = ["plain", "calm", "focus", "lift"];

/**
 * ⚠️ TONE SELECTS THE TOKEN, SKY SELECTS THE SHAPE. Keeping them separate is
 * what lets a warning-toned screen be calm and a success-toned one lift, without
 * eight combinations having to be drawn by hand.
 */
const TONE_TOKEN: Readonly<Record<Tone, string>> = {
  neutral: "var(--accent)",
  info: "var(--accent)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
};

export function skyCss(sky: Sky, tone: Tone = "neutral"): string {
  const hue = TONE_TOKEN[tone];
  switch (sky) {
    case "plain": return "";
    case "calm": return [
      `background-image: radial-gradient(120% 80% at 50% -20%,`,
      `color-mix(in oklab, ${hue} 18%, transparent) 0%, transparent 60%)`,
    ].join(" ");
    case "focus": return [
      `background-image: radial-gradient(60% 50% at 50% 40%,`,
      `color-mix(in oklab, ${hue} 12%, transparent) 0%, transparent 70%)`,
    ].join(" ");
    case "lift": return [
      `background-image: linear-gradient(180deg, transparent 30%,`,
      `color-mix(in oklab, ${hue} 14%, transparent) 100%)`,
    ].join(" ");
  }
}

/**
 * ⚠️ MOTION IS OPT-IN AND `prefers-reduced-motion` IS NOT NEGOTIABLE. An
 * ambience that drifts is pleasant to most people and makes some people ill;
 * respecting the setting is the difference between a nice touch and a product
 * somebody cannot use.
 */
export const SKY_MOTION = `
@media (prefers-reduced-motion: no-preference) {
  [data-sky]:not([data-sky="plain"])::before { animation: quad-drift 24s ease-in-out infinite alternate; }
}
@keyframes quad-drift { from { transform: translate3d(0, 0, 0) scale(1); }
  to { transform: translate3d(0, -2%, 0) scale(1.04); } }`;

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
