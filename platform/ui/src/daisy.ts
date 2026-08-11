/**
 * THE BRIDGE — our light, in daisyUI's variable names.
 *
 * ⚠️ THIS IS THE WHOLE INTEGRATION. daisyUI is a stylesheet driven entirely by
 * CSS variables, so handing it these twenty-seven values is the entire wiring:
 * no plugin, no Tailwind, no build step. Sixty-one components then draw
 * themselves in a tenant's light without knowing a tenant exists.
 *
 * ⚠️ THE MAP IS NEAR 1:1, AND THAT IS WHY THE LIBRARY WAS CHOSEN. daisyUI's
 * `--color-*-content` is *measured ink on that fill* — which is exactly what
 * `inkOn` computes. A library whose theming model disagreed with the engine
 * would need a translation layer with judgement in it, and judgement in a
 * translation layer is where a design system starts having two opinions.
 *
 * ⚠️ NOTHING HERE PICKS A COLOUR. Every value is read off the scene. The one
 * thing this file decides is *naming* — which of our tokens answers to which of
 * theirs — and that decision is exhaustively checked, because a name they read
 * and we never write is a component that silently falls back to their default
 * theme and looks like a different product.
 */

import type { Brand } from "./brand.js";
import { sceneFor, litFor } from "./scene.js";
import { inkOn } from "./ground.js";
import { oklchToRgb, toHex, type Oklch } from "./colour.js";
import { SEMANTIC } from "./semantic.js";
import type { Theme } from "./ground.js";

/**
 * ⚠️ EVERY VARIABLE daisyUI READS, LISTED SO THE MAP CAN BE PROVED COMPLETE.
 * Taken from its own `themes.css`; a test asserts we emit all of them. One we
 * miss is not a missing colour — it is that component, and only that component,
 * rendering in daisyUI's stock theme on a tenant's screen.
 */
export const DAISY_VARS = [
  "--color-base-100", "--color-base-200", "--color-base-300", "--color-base-content",
  "--color-primary", "--color-primary-content",
  "--color-secondary", "--color-secondary-content",
  "--color-accent", "--color-accent-content",
  "--color-neutral", "--color-neutral-content",
  "--color-success", "--color-success-content",
  "--color-warning", "--color-warning-content",
  "--color-error", "--color-error-content",
  "--color-info", "--color-info-content",
  "--radius-box", "--radius-field", "--radius-selector",
  "--size-field", "--size-selector",
  "--border", "--depth", "--noise",
] as const;

const hex = (c: Oklch): string => toHex(oklchToRgb(c));
const pair = (c: Oklch): readonly [string, string] => [hex(c), toHex(inkOn(c).ink)];

/**
 * A brand and a theme become every variable daisyUI reads.
 *
 * ⚠️ THE THREE ACCENT SLOTS ARE ONE HUE AT THREE DEPTHS, NOT THREE COLOURS.
 * daisyUI offers `primary`, `secondary` and `accent`; this language has ONE
 * accent, deliberately — one per screen is what reads as expensive. Filling the
 * other two with invented hues would hand every component author a second and
 * third brand colour to reach for, and the restraint would be gone in a week.
 * They are the same hue re-lit at the depth each is used on, so a component that
 * reaches for `secondary` gets something that is still recognisably the tenant.
 */
export function daisyTheme(brand: Brand, theme: Theme): Readonly<Record<string, string>> {
  const scene = sceneFor(brand, theme);
  const page = litFor(scene, 0);
  const card = litFor(scene, 1);
  const deep = litFor(scene, 2);

  const [success, successInk] = pair(SEMANTIC.success);
  const [warning, warningInk] = pair(SEMANTIC.warning);
  const [danger, dangerInk] = pair(SEMANTIC.danger);
  const [info, infoInk] = pair(SEMANTIC.info);

  return {
    /* The ladder. base-100 is the page, and everything above it is a step in. */
    "--color-base-100": hex(page.surface),
    "--color-base-200": hex(card.surface),
    "--color-base-300": hex(deep.surface),
    "--color-base-content": page.ink,

    /* One hue, three depths. See the note above. */
    "--color-primary": hex(page.accent),
    "--color-primary-content": page.accentInk,
    "--color-secondary": hex(card.accent),
    "--color-secondary-content": card.accentInk,
    "--color-accent": hex(deep.accent),
    "--color-accent-content": deep.accentInk,

    /* ⚠️ `neutral` is a SURFACE, not a grey. daisyUI fills badges and buttons
       with it, and a hardcoded grey on a branded ground is the one element that
       does not belong to the tenant. */
    "--color-neutral": hex(deep.surface),
    "--color-neutral-content": deep.ink,

    /* ⚠️ Semantic hues are NOT the tenant's, at any depth. A tenant who could
       move `error` could make a delete confirmation read as a success. */
    "--color-success": success, "--color-success-content": successInk,
    "--color-warning": warning, "--color-warning-content": warningInk,
    "--color-error": danger, "--color-error-content": dangerInk,
    "--color-info": info, "--color-info-content": infoInk,

    /* ⚠️ Concentric, not repeated: a radius inside a radius is smaller, or the
       corners look wrong at every nesting. */
    "--radius-box": `${brand.radius + 4}px`,
    "--radius-field": `${brand.radius}px`,
    "--radius-selector": `${Math.max(4, brand.radius - 4)}px`,

    /* ⚠️ A UNIT, NOT A HEIGHT. daisyUI multiplies these — a button is ten
       size-fields tall — so density moves every control at once, which is what
       the slot promises and what a per-component height could never deliver. */
    "--size-field": brand.density === "compact" ? "0.225rem" : "0.25rem",
    "--size-selector": brand.density === "compact" ? "0.225rem" : "0.25rem",

    /* ⚠️ An optical hairline, never a literal pixel: 1px is heavy at 1× and
       invisible at 3×, so a system that hardcodes it looks different on every
       screen it ships to. */
    "--border": brand.edge === "none" ? "0" : brand.edge === "hairline" ? "max(0.5px, 0.0625rem)" : "max(1px, 0.125rem)",

    /* ⚠️ Depth is daisyUI's own shading, and it is OFF in dark for the reason
       shadows are: a shadow on a near-black ground is invisible, and every pixel
       spent drawing one is a pixel that makes nothing clearer. */
    "--depth": brand.elevation === "soft" && theme === "light" ? "1" : "0",
    /* Never. It is a texture nobody asked for, on every surface at once. */
    "--noise": "0",
  };
}

/**
 * The theme as a rule, for both themes, scoped the way §1 requires.
 *
 * ⚠️ BOTH THEMES ARE ALWAYS EMITTED, and the dark one twice — once behind
 * `prefers-color-scheme` for the un-stamped default, once behind an explicit
 * attribute so a toggle wins in either direction. A palette defined only inside
 * a media query has no value at all when the root carries an explicit choice,
 * and the symptom is a screen with no background.
 */
export function daisySheet(brand: Brand): string {
  const decl = (t: Theme) =>
    Object.entries(daisyTheme(brand, t)).map(([k, v]) => `  ${k}: ${v};`).join("\n");
  return [
    `:root {\n${decl("light")}\n}`,
    `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme='light']) {\n${decl("dark")}\n  }\n}`,
    `:root[data-theme='dark'] {\n${decl("dark")}\n}`,
  ].join("\n\n");
}
