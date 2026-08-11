/**
 * THE SCENE — the one derivation, and the reason an app declares nothing.
 *
 * ⚠️ AN APP SAYS WHAT A THING IS. IT NEVER SAYS HOW A THING LOOKS. That is the
 * whole contract, and everything else in this package is machinery for keeping
 * it true. A screen hands over a role, a position and some content; the colour,
 * the elevation, the spacing, the timing and the shape are computed from where
 * that thing ended up standing.
 *
 * ⚠️ THIS IS A PHYSICS, NOT A THEME. There is one light. Surfaces are lit by it
 * rather than painted; ink is measured against whatever it lands on; elevation
 * is a step toward the light; the sky is the light's colour. Every rule below is
 * a consequence of those four sentences, which is why the system has no
 * per-component decisions to keep in step — there is nothing to keep in step.
 *
 * ⚠️ THE VALUE OF A CLOSED DECLARATION IS THAT IT CAN BE SWEPT. `DECLARABLE` is
 * the complete list of what an app may say. It is short on purpose: a surface
 * small enough to enumerate is a surface that can be proved safe for every
 * tenant, and that proof is the product feature. One escape hatch and the sweep
 * stops being a guarantee and becomes a sample.
 */

import type { Brand } from "./brand.js";
import { groundFor } from "./brand.js";
import { accentOn, inkOn, surfaces, type Ground, type Theme } from "./ground.js";
import { toHex, type Oklch } from "./colour.js";
import type { Depth } from "./components/primitives.js";

/* ------------------------------------------------------------------ laws --- */

/**
 * The four laws, written where they can be quoted rather than remembered.
 *
 * ⚠️ EACH ONE NAMES WHAT IT REPLACES. A law with no alternative stated is a
 * preference; a law that names the thing it forbids is a decision somebody can
 * disagree with, which is the only kind worth writing down.
 */
export const LAWS = [
  {
    law: "There is one light",
    means: "A brand and a theme are a light source. Everything visible is that light falling on something.",
    replaces: "A palette — a list of colours somebody picked, which cannot answer what a NEW surface should be.",
  },
  {
    law: "Surfaces are lit, never painted",
    means: "A surface is one perceptual step from its parent, in the direction with more headroom.",
    replaces: "Named greys. `surface-2` is a decision at the call site, so nesting collides and nobody can see it coming.",
  },
  {
    law: "Ink is measured",
    means: "The on-colour of any fill is computed against that exact fill, and the winner of near-white and near-dark is kept.",
    replaces: "A `*-foreground` token, which lets somebody pair a colour with ink that fails on it.",
  },
  {
    law: "Position decides, not the caller",
    means: "Depth comes from nesting, spacing from the container, timing from the role, size from the frame.",
    replaces: "Props. A `depth`, a `margin`, a `duration` or a `size` prop is the same screen looking different in two places.",
  },
] as const;

/* ----------------------------------------------------- the declaration --- */

/**
 * ⚠️ EVERYTHING AN APP MAY SAY. If a word is not on this list an app cannot say
 * it, which is what makes the tenant sweep a proof rather than a spot check.
 *
 * Read it as four questions: what IS this, where does it sit, what is it doing,
 * and what does it contain. None of them is answerable with a colour.
 */
export const DECLARABLE = {
  /** What the thing IS. Resolves to every visual property it has. */
  role: ["ground", "anchor", "content", "chrome", "overlay"],
  /** What the SCREEN is. Decides the top, the sky and the rhythm. See UI.md §5.6. */
  archetype: ["crown", "topic", "title", "identity", "feed"],
  /** What the screen is ABOUT, which decides the light behind it. See UI.md §5.5. */
  sky: ["aurora", "photo", "dots", "waves", "grid", "rings"],
  /** What is TRUE of it right now. Never a look — a fact the renderer draws. */
  state: ["idle", "busy", "locked", "disabled", "unknown", "empty", "partial", "error", "ready"],
  /** What it MEANS, for the five things a product ever needs to signal. */
  tone: ["accent", "success", "warning", "danger", "info"],
} as const;

/**
 * ⚠️ WHAT AN APP MAY NEVER SAY, and the name of the thing that decides instead.
 * Kept beside `DECLARABLE` because a prohibition with no replacement is a rule
 * people route around; with one, it is a signpost.
 */
export const DERIVED: Readonly<Record<string, string>> = {
  colour: "the light, and the surface it lands on — `litFor`",
  background: "depth, which comes from nesting — `litFor`",
  foreground: "measurement against that exact fill — `inkOn`",
  elevation: "depth, in the direction with more headroom — `surfaces`",
  radius: "the brand's one radius, stepped concentrically",
  margin: "nothing. Spacing is the container's gap, never a child's margin",
  padding: "the role, and the frame it is in",
  duration: "the role, on one clock — UI.md §4",
  easing: "whether the thing is arriving, leaving or being pressed",
  fontSize: "the text role, on one ladder — UI.md §5.1",
  width: "the container, asked with a container query and never the viewport",
};

/* ---------------------------------------------------------------- scene --- */

/**
 * ⚠️ DEPTH IS NEVER PASSED. It is counted from nesting.
 *
 * Re-exported from the primitives rather than declared twice: two definitions of
 * how far a thing is from the light is how the ladder and the renderer come to
 * disagree about the same card.
 */
export type { Depth };

export interface Scene {
  readonly brand: Brand;
  readonly theme: Theme;
  readonly ground: Ground;
}

export const sceneFor = (brand: Brand, theme: Theme): Scene =>
  ({ brand, theme, ground: groundFor(brand, theme) });

export interface Lit {
  /** The surface itself, at this depth. */
  readonly surface: Oklch;
  /** Measured against that exact surface — never chosen, never inherited. */
  readonly ink: string;
  /** The tenant's accent, re-lit so it clears its floor HERE. */
  readonly accent: Oklch;
  /** Measured against the re-lit accent, for anything filled with it. */
  readonly accentInk: string;
  /** How far this reading is above the contrast floor. Reported, never assumed. */
  readonly ratio: number;
}

/**
 * ⚠️ THE WHOLE ENGINE, IN ONE CALL. Everything a thing needs in order to be
 * drawn, given only where it is standing.
 *
 * ⚠️ THE ACCENT IS RE-LIT PER SURFACE, NOT ONCE PER THEME. The same brand on a
 * page and on a card is one hue at two lightnesses, because those are different
 * distances from the light. Computing it once produces a product whose brand
 * colour is legible on some screens and not others, and the usual fix — letting
 * each screen pick a new primary — produces one whose brand colour is a
 * different colour on every screen.
 */
export function litFor(scene: Scene, depth: Depth): Lit {
  const ladder = surfaces(scene.ground, 3);
  const surface = ladder[depth] ?? ladder[ladder.length - 1]!;
  const measured = inkOn(surface);
  const accent = accentOn(scene.ground.accent, surface);
  return {
    surface,
    ink: toHex(measured.ink),
    accent,
    accentInk: toHex(inkOn(accent).ink),
    ratio: measured.ratio,
  };
}

/*
  ⚠️ `toHex` IS IMPORTED, NEVER RE-WRITTEN. There was a second one here that
  assumed 0–255 while `Rgb` in this package is 0–1, so it encoded white as
  `#010101` — a near-black. Nothing threw: `inkOn` reported its true ratio of
  5.43 while handing back a colour that measured 3.68, so the engine looked
  correct and only the pixels were wrong.

  Two implementations of one conversion is the same defect as two
  implementations of "what colour is this" — which is the thing this whole file
  exists to prevent, written one layer down.
*/

/* -------------------------------------------------------------- problems --- */

export interface SceneProblem { readonly at: string; readonly detail: string }

/**
 * ⚠️ THE CHECK THAT MAKES THE CONTRACT REAL. A declaration is only closed if
 * something refuses what is outside it — otherwise `DECLARABLE` is a comment.
 *
 * Takes what an app said and reports every word the language does not have. It
 * is deliberately a REPORT rather than a throw: this runs over a whole manifest,
 * and the useful answer is all six mistakes at once rather than the first.
 */
export function declarationProblems(said: Readonly<Record<string, string>>): readonly SceneProblem[] {
  const out: SceneProblem[] = [];
  for (const [key, value] of Object.entries(said)) {
    const allowed = (DECLARABLE as Readonly<Record<string, readonly string[]>>)[key];
    if (!allowed) {
      const why = DERIVED[key];
      out.push({
        at: key,
        detail: why
          ? `is derived from ${why}, and cannot be declared`
          : `is not part of the language — an app may say only: ${Object.keys(DECLARABLE).join(", ")}`,
      });
      continue;
    }
    if (!allowed.includes(value)) {
      out.push({ at: key, detail: `"${value}" is not one of: ${allowed.join(", ")}` });
    }
  }
  return out;
}
