/**
 * ⚠️ THE ENGINE AND ITS FAMILIES, BEHIND ONE DOOR. A screen never reaches for a
 * family directly — it names a scene and gets a ground, exactly as it names a
 * shape and gets a layout.
 */
export * from "./scene.js";
export * from "./space.js";
export * from "./aura.js";
export * from "./loops.js";
export * from "./blobs.js";
export * from "./glow.js";
export * from "./cloth.js";
export * from "./etch.js";
export * from "./tint.js";

import { SPACE } from "./space.js";
import { AURA } from "./aura.js";
import { LOOPS } from "./loops.js";
import { BLOBS } from "./blobs.js";
import { GLOW } from "./glow.js";
import { CLOTH } from "./cloth.js";
import { ETCH } from "./etch.js";
import { TINT } from "./tint.js";

/**
 * EVERY WORLD THIS PRODUCT HAS, IN ONE PLACE.
 *
 * ⚠️ A REGISTRY RATHER THAN SEVEN IMPORTS AT THE CALL SITE, because "how many
 * families are there" has to have an answer that is a value and not a grep. The
 * binding resolves a name against this (`worldCss`), the conformance test sweeps
 * it, and a family that is not in it is a family nothing can reach — which is
 * the honest failure, arriving at the moment it is added rather than the day
 * somebody wonders why their ground is missing.
 *
 * ⚠️ AND EVERY ENTRY IS A PAIR. A family with one sky is a family that has a
 * made-up rule for the other theme, which is the mistake `space` made and spent
 * three builds on. Two skies is the shape.
 *
 * ⚠️ SEVEN OF THESE REPLACED TWENTY-FOUR HAND-WRITTEN GROUNDS, and the ratio is
 * the argument for the whole directory. Each of the twenty-four was one world
 * drawn once; each of these is every world in its own space. `glow` alone covers
 * the nine that were soft light, `cloth` the seven that were fine lines, `etch`
 * the six that were ruled geometry.
 */
export const FAMILIES = {
  space: SPACE, aura: AURA, loops: LOOPS, blobs: BLOBS,
  glow: GLOW, cloth: CLOTH, etch: ETCH,
  /* ⚠️ THE ONE FAMILY WITH A HUE OF ITS OWN — see `tint.ts`. Every other draws
     in the theme's colours, which on a monochrome product means no colour at
     all; there is no seed of a mono palette that produces a tint. */
  tint: TINT,
} as const;

/** ⚠️ Named, never handed over — a family composed at a call site is exactly
    what this directory exists to stop. */
export type SceneFamily = keyof typeof FAMILIES;

/**
 * THE FAMILIES A SCREEN MAY NAME, WHICH IS NOT ALL OF THEM.
 *
 * ⚠️ THE SPLIT IS `Family.ink`, AND IT IS A CONSTRAINT RATHER THAN A POLICY.
 * `space` and `aura` read their two colours out of a generated PICTURE and paint
 * marks with them; there is no picture behind a screen, only the theme, and
 * `var(--brand)` inside an SVG is a string rather than a colour — it resolves to
 * nothing and the field is silently absent. So a screen may name any family that
 * draws in ink, and the two that draw in a subject's own colours belong to a
 * subject.
 *
 * ⚠️ DERIVED, NOT LISTED. A family that changes its `ink` moves between these
 * two sets on its own, which is the only way a list like this stays true.
 */
export const SKIES: readonly SceneFamily[] = (Object.keys(FAMILIES) as SceneFamily[])
  .filter((id) => FAMILIES[id].night.ink === "fixed");

/**
 * ⚠️ `plain` IS STILL THE DEFAULT, AND THAT DID NOT CHANGE WITH THE ENGINE.
 * Ambience everywhere is ambience nowhere: the reason the rich screens in a good
 * product land is that most screens are flat. What earns a ground is a screen
 * somebody ARRIVES at — a balance, a home, a result — never a form and never a
 * list.
 */
export type Sky = "plain" | "glow" | "cloth" | "etch" | "loops" | "blobs" | "tint";
