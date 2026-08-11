/**
 * THE SEMANTIC HUES — the platform's, and never a brand slot.
 *
 * ⚠️ DANGER IS NOT A BRAND DECISION. A tenant who could set it could make a
 * delete confirmation read as a success, and nothing downstream would notice:
 * the contrast still clears, the word is still there, and the colour says the
 * opposite of the sentence next to it.
 *
 * These are hues rather than colours. What lightness each takes is decided by
 * the ground it lands on, exactly as an accent's is.
 */

import type { Oklch } from "./colour.js";

export const SEMANTIC: Readonly<Record<"success" | "warning" | "danger" | "info", Oklch>> = {
  success: { l: 0.62, c: 0.16, h: 148 },
  warning: { l: 0.75, c: 0.16, h: 78 },
  danger: { l: 0.58, c: 0.2, h: 25 },
  info: { l: 0.62, c: 0.14, h: 245 },
};
