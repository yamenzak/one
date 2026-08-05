/**
 * KOVA'S VOCABULARY — the registries that are this product's, not the system's.
 *
 * `@4dl/ui` is the shared design language, product-agnostic by contract
 * (UI-LANGUAGE.md's header says so in the first line). These three were living
 * in it anyway, which meant the next app to consume the package would inherit
 * personal trainers, macronutrients and intermittent fasting whether or not it
 * had any:
 *
 *   METRICS        the metric registry — weight, sleep, mood, water, steps…
 *   FASTING_ZONES  metabolic phases of a fast
 *   persona        "Coach" / "Client" / "Owner" labels and their tones
 *
 * They are re-exported from one place so a screen imports vocabulary from here
 * and components from the package, and the seam between the two is visible in
 * every import block.
 */

export * from "./credits.js";
export * from "./metrics.js";
export * from "./persona.js";
export * from "./macros.js";
