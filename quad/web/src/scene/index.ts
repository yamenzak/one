/**
 * ⚠️ THE ENGINE AND ITS FAMILIES, BEHIND ONE DOOR. A screen never reaches for a
 * family directly — it names a scene and gets a ground, exactly as it names a
 * shape and gets a layout.
 */
export * from "./scene.js";
export * from "./space.js";
export * from "./aura.js";

import { SPACE } from "./space.js";
import { AURA } from "./aura.js";

/**
 * EVERY WORLD THIS PRODUCT HAS, IN ONE PLACE.
 *
 * ⚠️ A REGISTRY RATHER THAN TWO IMPORTS AT THE CALL SITE, because "how many
 * families are there" has to have an answer that is a value and not a grep. The
 * binding resolves a name against this (`worldCss`), the conformance test sweeps
 * it, and a family that is not in it is a family nothing can reach — which is
 * the honest failure, arriving at the moment it is added rather than the day
 * somebody wonders why their ground is missing.
 *
 * ⚠️ AND EVERY ENTRY IS A PAIR. A family with one sky is a family that has a
 * made-up rule for the other theme, which is the mistake `space` made and spent
 * three builds on. Two skies is the shape.
 */
export const FAMILIES = { space: SPACE, aura: AURA } as const;

/** ⚠️ Named, never handed over — a family composed at a call site is exactly
    what this directory exists to stop. */
export type SceneFamily = keyof typeof FAMILIES;
