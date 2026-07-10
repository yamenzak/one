/**
 * Body-fat estimation (SPEC §8.5) — pure. US Navy circumference formula, ACE
 * category bands, and the ellipse-circumference helper the camera estimator
 * feeds (front + side silhouette half-widths -> C ≈ π(a+b)).
 */

import type { Gender } from "./nutrition.js";

/** US Navy body-fat %, all inputs in cm. Null when inputs can't produce one. */
export function calculateBodyFatNavy(
  gender: Gender,
  waistCm: number,
  neckCm: number,
  heightCm: number,
  hipsCm?: number | null,
): number | null {
  if (!waistCm || !neckCm || !heightCm) return null;
  if (waistCm <= neckCm) return null;

  let bf: number;
  if (gender === "male") {
    bf =
      495 /
        (1.0324 -
          0.19077 * Math.log10(waistCm - neckCm) +
          0.15456 * Math.log10(heightCm)) -
      450;
  } else {
    if (!hipsCm) return null;
    bf =
      495 /
        (1.29579 -
          0.35004 * Math.log10(waistCm + hipsCm - neckCm) +
          0.221 * Math.log10(heightCm)) -
      450;
  }
  if (!Number.isFinite(bf)) return null;
  return Math.max(0, Math.round(bf * 10) / 10);
}

export type BodyFatCategory = "essential" | "athletic" | "fitness" | "average" | "above_average";

/** ACE bands, upper bound exclusive. */
export const BODY_FAT_BANDS: Record<Gender, [number, BodyFatCategory][]> = {
  male: [
    [6, "essential"],
    [14, "athletic"],
    [18, "fitness"],
    [25, "average"],
    [Infinity, "above_average"],
  ],
  female: [
    [14, "essential"],
    [21, "athletic"],
    [25, "fitness"],
    [32, "average"],
    [Infinity, "above_average"],
  ],
};

export function classifyBodyFat(bf: number, gender: Gender): BodyFatCategory | null {
  if (!(bf > 0)) return null;
  for (const [upper, cat] of BODY_FAT_BANDS[gender]) {
    if (bf < upper) return cat;
  }
  return null;
}

/**
 * Ellipse circumference from front and side full widths (cm): semi-axes
 * a = front/2, b = side/2, C ≈ π(a+b) (Ramanujan-lite — adequate at ±5-8%
 * overall error budget of the camera path).
 */
export function ellipseCircumference(frontWidthCm: number, sideWidthCm: number): number | null {
  if (!(frontWidthCm > 0) || !(sideWidthCm > 0)) return null;
  const a = frontWidthCm / 2;
  const b = sideWidthCm / 2;
  return Math.round(Math.PI * (a + b) * 10) / 10;
}

/** Nose→ankle is ~86% of standing height (camera px/cm calibration). */
export const NOSE_TO_ANKLE_FRACTION_OF_HEIGHT = 0.86;

/** px-per-cm scale from a measured nose→ankle pixel span + known height. */
export function pixelScaleFromHeight(bodyPxHeight: number, heightCm: number): number | null {
  if (!(bodyPxHeight > 0) || !(heightCm > 0)) return null;
  return bodyPxHeight / (heightCm * NOSE_TO_ANKLE_FRACTION_OF_HEIGHT);
}
