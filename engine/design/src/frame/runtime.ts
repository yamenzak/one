/**
 * EVERYTHING THIS PACKAGE PUTS IN THE DOCUMENT AT BOOT, IN ONE STRING.
 *
 * ⚠️ IT IS NOT IN THE BUILT STYLESHEET AND CANNOT BE. The grounds and the drift
 * are derived from the accent at RUNTIME — a workspace's brand has to reach the
 * background of every screen without any screen knowing branding exists — so
 * they are injected rather than compiled. Tailwind never sees them.
 *
 * ⚠️ WHICH MEANS A HARNESS MEASURING ONLY THE BUILT CSS IS MEASURING A DIFFERENT
 * PRODUCT. No type face, no ground, no tone, no motion: the fallback stack has
 * different metrics, so every height and every wrap is somebody else's. The
 * geometry sweeps read this too, which is the whole reason it is one function
 * rather than a list each caller assembles.
 *
 * ⚠️ AND IT IS IN `frame` BECAUSE IT WRAPS EVERY SCREEN — the same question that
 * directory answers for `Page` and `Shell`. It cannot be in `tokens`: it draws
 * on the chart's motion and the travel's, and a token file importing upward is
 * the layering going backwards.
 *
 * ⚠️ THE DEPLOYMENT'S OWN BRAND IS NOT HERE, deliberately. `brandCss({ accent })`
 * comes after — a colour is the deployment's decision and this package has no
 * business holding one. Source order is what makes a workspace's own choice win
 * after both.
 */

import { CHART_MOTION } from "../chart/charts.js";
import { TRAVEL_MOTION } from "./travel.js";
import { ambienceStylesheet } from "../tokens/ambience.js";
import { GROUND_CSS } from "../tokens/ground.js";
import { ARRIVE_MOTION, BLOCK_MOTION, DOOR_MOTION, GLYPH_MOTION, OPENING_MOTION } from "../tokens/motion.js";
import { TONE_CSS } from "../tokens/theme.js";
import { FACE_CSS } from "../tokens/type.js";

export const runtimeCss = (): string => [
  FACE_CSS, GROUND_CSS, ambienceStylesheet(), TONE_CSS,
  ARRIVE_MOTION, BLOCK_MOTION, DOOR_MOTION, CHART_MOTION,
  GLYPH_MOTION, TRAVEL_MOTION, OPENING_MOTION,
].join("\n");
