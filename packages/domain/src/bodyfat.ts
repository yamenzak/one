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
 * a = front/2, b = side/2. Ramanujan's second approximation — accurate to
 * ~1e-5 even for elongated cross-sections (a torso is noticeably elliptical, so
 * the cruder π(a+b) under-reads a wide-shallow waist). This is the core of the
 * camera path, so it's worth the exactness.
 */
export function ellipseCircumference(frontWidthCm: number, sideWidthCm: number): number | null {
  if (!(frontWidthCm > 0) || !(sideWidthCm > 0)) return null;
  const a = frontWidthCm / 2;
  const b = sideWidthCm / 2;
  const h = ((a - b) / (a + b)) ** 2;
  const c = Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
  return Math.round(c * 10) / 10;
}

/** Nose→ankle is ~86% of standing height (camera px/cm calibration). */
export const NOSE_TO_ANKLE_FRACTION_OF_HEIGHT = 0.86;

/** px-per-cm scale from a measured nose→ankle pixel span + known height. */
export function pixelScaleFromHeight(bodyPxHeight: number, heightCm: number): number | null {
  if (!(bodyPxHeight > 0) || !(heightCm > 0)) return null;
  return bodyPxHeight / (heightCm * NOSE_TO_ANKLE_FRACTION_OF_HEIGHT);
}

// ── Ensemble body-fat estimator (the camera-scan model) ──────────────────────
// A 2D silhouette can't beat ~±3-4% vs DEXA — the information isn't there — so
// instead of pretending one formula is truth, we run several INDEPENDENT public
// equations and blend them. Their agreement IS the confidence: tight cluster →
// high confidence + narrow band; wide spread → low confidence + wide band. No
// per-user calibration, no external service — pure, testable math.

/** Relative Fat Mass (Woolcott & Bergman 2018) — height/waist ratio, validated
 *  against DEXA; needs no neck/hip. Waist + height in cm. */
export function relativeFatMass(gender: Gender, heightCm: number, waistCm: number): number | null {
  if (!(heightCm > 0) || !(waistCm > 0)) return null;
  const rfm = (gender === "male" ? 64 : 76) - 20 * (heightCm / waistCm);
  return Number.isFinite(rfm) ? Math.round(rfm * 10) / 10 : null;
}

/** Deurenberg (1991) BMI+age body-fat %. A shape-blind anchor that keeps the
 *  circumference methods honest when the silhouette scale is slightly off. */
export function deurenbergBodyFat(bmi: number, ageYears: number, gender: Gender): number | null {
  if (!(bmi > 0) || !(ageYears > 0)) return null;
  const bf = 1.2 * bmi + 0.23 * ageYears - 10.8 * (gender === "male" ? 1 : 0) - 5.4;
  return Number.isFinite(bf) ? Math.round(bf * 10) / 10 : null;
}

export interface BodyScanInput {
  gender: Gender;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  /** Circumferences derived on-device from the front+side silhouette (cm). */
  neckCm: number;
  waistCm: number;
  hipsCm?: number | null;
}

export interface BodyFatEstimate {
  /** Blended body-fat %, clamped to a physiological range. */
  bodyFatPercent: number;
  /** Confidence band (method-agreement derived, not a statistical CI). */
  low: number;
  high: number;
  confidence: "high" | "medium" | "low";
  /** Per-method estimates that fed the blend (for transparency + the UI reveal). */
  methods: { method: "navy" | "rfm" | "deurenberg"; value: number; weight: number }[];
}

const clampBf = (n: number): number => Math.min(65, Math.max(2, Math.round(n * 10) / 10));

/**
 * Blend the independent estimators into one body-fat % with a confidence band.
 * Circumference methods (Navy, RFM) carry the silhouette signal so they weigh
 * most; Deurenberg is a lighter shape-blind anchor. Returns null only when not
 * even a single method can be computed.
 */
export function estimateBodyFat(input: BodyScanInput): BodyFatEstimate | null {
  const { gender, ageYears, heightCm, weightKg, neckCm, waistCm, hipsCm } = input;
  const bmi = heightCm > 0 ? weightKg / (heightCm / 100) ** 2 : 0;

  const raw: { method: "navy" | "rfm" | "deurenberg"; value: number; weight: number }[] = [];
  const navy = calculateBodyFatNavy(gender, waistCm, neckCm, heightCm, hipsCm ?? null);
  if (navy != null) raw.push({ method: "navy", value: clampBf(navy), weight: 0.45 });
  const rfm = relativeFatMass(gender, heightCm, waistCm);
  if (rfm != null) raw.push({ method: "rfm", value: clampBf(rfm), weight: 0.4 });
  const deur = deurenbergBodyFat(bmi, ageYears, gender);
  if (deur != null) raw.push({ method: "deurenberg", value: clampBf(deur), weight: 0.15 });
  if (raw.length === 0) return null;

  const totalW = raw.reduce((s, m) => s + m.weight, 0);
  const methods = raw.map((m) => ({ ...m, weight: Math.round((m.weight / totalW) * 100) / 100 }));
  const bodyFatPercent = clampBf(raw.reduce((s, m) => s + m.value * m.weight, 0) / totalW);

  // Method agreement → confidence + band. A single method → widest band.
  const values = raw.map((m) => m.value);
  const spread = raw.length > 1 ? Math.max(...values) - Math.min(...values) : 8;
  const margin = Math.min(6, Math.max(1.5, spread / 2));
  const confidence: BodyFatEstimate["confidence"] = spread <= 3 ? "high" : spread <= 6 ? "medium" : "low";
  return {
    bodyFatPercent,
    low: clampBf(bodyFatPercent - margin),
    high: clampBf(bodyFatPercent + margin),
    confidence,
    methods,
  };
}
