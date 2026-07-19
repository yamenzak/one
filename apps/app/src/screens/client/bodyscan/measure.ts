/**
 * On-device silhouette measurement — PURE geometry, no MediaPipe, no I/O, no
 * pixels leave here. Given a person-segmentation mask (confidence 0..1) plus the
 * 33 pose landmarks for a captured frame, it locates the anatomical levels
 * (neck / chest / waist / hips) from landmark y-positions, samples the body
 * width at each, converts px→cm from the nose→ankle span, and blends the front
 * and side widths into circumferences with the domain's ellipse model. It also
 * traces a de-identified, bbox-normalized outline polygon for the reveal + morph.
 *
 * This is the ONLY thing derived from the (possibly nude) frame; the RGB frame
 * is discarded by the caller the instant this returns.
 */

import { ellipseCircumference, pixelScaleFromHeight } from "@mossa/domain";

/** A MediaPipe normalized landmark (x,y,z in 0..1 of the frame; visibility 0..1). */
export interface NormLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

/** A single captured pose: the person mask + the landmarks for that frame. */
export interface Capture {
  /** Person-confidence mask, row-major, length = width*height, values 0..1. */
  mask: Float32Array;
  width: number;
  height: number;
  landmarks: NormLandmark[];
}

/** Front OR side per-site widths in cm, plus the normalized outline. */
export interface SiteWidths {
  pxPerCm: number | null;
  neckCm: number | null;
  chestCm: number | null;
  waistCm: number | null;
  hipsCm: number | null;
  /** De-identified outline, bbox-normalized to 0..1, ≤600 points. */
  contour: [number, number][];
}

export interface Circumferences {
  neckCm: number;
  waistCm: number;
  hipsCm?: number;
  chestCm?: number;
}

// ── MediaPipe Pose (33-landmark) indices we use ──────────────────────────────
export const LM = {
  nose: 0,
  lShoulder: 11,
  rShoulder: 12,
  lElbow: 13,
  rElbow: 14,
  lWrist: 15,
  rWrist: 16,
  lHip: 23,
  rHip: 24,
  lAnkle: 27,
  rAnkle: 28,
} as const;

const THRESH = 0.5; // person cutoff — the DeepLab mask is a clean 0/1 body mask,
// so any 0<t<1 selects the body; the landmark fallback covers a missed segment
/** nose→hip is ~0.40 of standing height — the fallback scale when feet are out
 *  of frame (nose ≈0.93·H, hip/greater-trochanter ≈0.53·H). */
const NOSE_TO_HIP_FRACTION = 0.4;
const clampF = (n: number): number => Math.round(n * 10) / 10;

/** Left/right body extent (px) of one mask row, or null if the row is empty. */
function rowExtent(mask: Float32Array, w: number, h: number, y: number): { min: number; max: number } | null {
  const yi = Math.round(y);
  if (yi < 0 || yi >= h) return null;
  const base = yi * w;
  let min = -1;
  let max = -1;
  for (let x = 0; x < w; x++) {
    if (mask[base + x]! > THRESH) {
      if (min < 0) min = x;
      max = x;
    }
  }
  return min < 0 ? null : { min, max };
}

/** Median body width (px) across a few rows centered on y — robust to noise. */
function widthAt(mask: Float32Array, w: number, h: number, y: number): number {
  const widths: number[] = [];
  for (let dy = -2; dy <= 2; dy++) {
    const ext = rowExtent(mask, w, h, y + dy);
    if (ext) widths.push(ext.max - ext.min + 1);
  }
  if (widths.length === 0) return 0;
  widths.sort((a, b) => a - b);
  return widths[Math.floor(widths.length / 2)]!;
}

/** Scan a vertical band for the row of extreme (min|max) body width. */
function extremeWidthRow(mask: Float32Array, w: number, h: number, yA: number, yB: number, mode: "min" | "max"): { y: number; width: number } {
  const lo = Math.max(0, Math.min(yA, yB));
  const hi = Math.min(h - 1, Math.max(yA, yB));
  let bestY = (lo + hi) / 2;
  let best = mode === "min" ? Infinity : -1;
  for (let y = Math.round(lo); y <= Math.round(hi); y++) {
    const ext = rowExtent(mask, w, h, y);
    if (!ext) continue;
    const width = ext.max - ext.min + 1;
    if ((mode === "min" && width < best) || (mode === "max" && width > best)) {
      best = width;
      bestY = y;
    }
  }
  return { y: bestY, width: best > 0 && Number.isFinite(best) ? best : 0 };
}

const vis = (lm: NormLandmark | undefined): number => lm?.visibility ?? 1;

/**
 * Trace a de-identified outline from the mask: sample rows across the body
 * bounding box, take each row's left & right edge, and stitch a closed polygon
 * (down the left edges, back up the right). Normalized into the bbox so scans at
 * different camera distances still overlay for the morph. ≤600 points.
 */
function extractContour(mask: Float32Array, w: number, h: number, sampleRows = 140): [number, number][] {
  let minX = w;
  let maxX = -1;
  let minY = h;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    const ext = rowExtent(mask, w, h, y);
    if (!ext) continue;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (ext.min < minX) minX = ext.min;
    if (ext.max > maxX) maxX = ext.max;
  }
  if (maxX < 0 || maxY <= minY) return [];
  const bw = Math.max(1, maxX - minX);
  const bh = Math.max(1, maxY - minY);
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  const rows = Math.min(sampleRows, Math.max(8, Math.floor((maxY - minY) / 2)));
  for (let i = 0; i <= rows; i++) {
    const y = minY + ((maxY - minY) * i) / rows;
    const ext = rowExtent(mask, w, h, y);
    if (!ext) continue;
    const ny = (y - minY) / bh;
    left.push([Math.round(((ext.min - minX) / bw) * 1000) / 1000, Math.round(ny * 1000) / 1000]);
    right.push([Math.round(((ext.max - minX) / bw) * 1000) / 1000, Math.round(ny * 1000) / 1000]);
  }
  const poly = [...left, ...right.reverse()];
  // Cap at 600 points (protocol limit) by even decimation.
  if (poly.length <= 600) return poly;
  const step = poly.length / 600;
  const out: [number, number][] = [];
  for (let i = 0; i < 600; i++) out.push(poly[Math.floor(i * step)]!);
  return out;
}

/**
 * Measure one captured pose. Returns per-site widths (cm) + the outline. Sites
 * that can't be located (off-frame, occluded) come back null and are dropped by
 * the caller. Uses the frame's OWN nose→ankle span for px/cm so front and side
 * captures self-calibrate independently.
 */
export function measureCapture(cap: Capture, heightCm: number): SiteWidths {
  const { mask, width: w, height: h, landmarks: lm } = cap;
  const contour = extractContour(mask, w, h);

  const nose = lm[LM.nose];
  const lAnk = lm[LM.lAnkle];
  const rAnk = lm[LM.rAnkle];
  const lSh = lm[LM.lShoulder];
  const rSh = lm[LM.rShoulder];
  const lHip = lm[LM.lHip];
  const rHip = lm[LM.rHip];
  if (!nose || !lSh || !rSh || !lHip || !rHip) return { pxPerCm: null, neckCm: null, chestCm: null, waistCm: null, hipsCm: null, contour };

  const noseY = nose.y * h;
  const shoulderY = ((lSh.y + rSh.y) / 2) * h;
  const hipY = ((lHip.y + rHip.y) / 2) * h;
  const torso = Math.max(1, hipY - shoulderY);

  // px/cm scale. Prefer the full nose→ankle span (domain applies the 0.86 height
  // factor). But feet are very often out of frame on a phone held at chest
  // height, so fall back to the nose→hip span (nose ≈0.93·H, hip ≈0.53·H →
  // ≈0.40·H) — that lets a head-to-thigh capture still calibrate instead of
  // failing outright. (Both are self-calibrated per frame.)
  const ankleY = Math.max(vis(lAnk) > 0.5 ? (lAnk?.y ?? 0) : 0, vis(rAnk) > 0.5 ? (rAnk?.y ?? 0) : 0) * h;
  let pxPerCm: number | null = ankleY > noseY ? pixelScaleFromHeight(ankleY - noseY, heightCm) : null;
  if (!pxPerCm && hipY > noseY && heightCm > 0) pxPerCm = (hipY - noseY) / (heightCm * NOSE_TO_HIP_FRACTION);

  const toCm = (px: number): number | null => (pxPerCm && px > 0 ? clampF(px / pxPerCm) : null);

  // Neck: narrowest row just above the shoulders (between head and shoulders).
  const neck = extremeWidthRow(mask, w, h, shoulderY - torso * 0.28, shoulderY - torso * 0.04, "min");
  // Chest: just below the shoulder line.
  const chestPx = widthAt(mask, w, h, shoulderY + torso * 0.2);
  // Waist: narrowest torso row in the lower-mid torso.
  const waist = extremeWidthRow(mask, w, h, shoulderY + torso * 0.45, hipY - torso * 0.05, "min");
  // Hips: widest row around the hip landmark level.
  const hips = extremeWidthRow(mask, w, h, hipY - torso * 0.05, hipY + torso * 0.15, "max");

  // Widths come ONLY from the person silhouette. We deliberately do NOT synthesize
  // them from pose-landmark breadths as a fallback: the hip landmarks sit at the
  // joint centres, far narrower than the true waist/hip girth, so that fallback
  // produced a wildly-too-small waist → an absurd, competition-lean body-fat
  // number stated with false confidence. If the mask can't locate the sites,
  // these come back null and the caller honestly routes to manual entry instead.
  return {
    pxPerCm,
    neckCm: toCm(neck.width),
    chestCm: toCm(chestPx),
    waistCm: toCm(waist.width),
    hipsCm: toCm(hips.width),
    contour,
  };
}

/**
 * Blend front + side site widths into circumferences (ellipse cross-section).
 * Neck + waist are required; hips + chest are included only when both views
 * measured them. Falls back to a circular approximation (front≈side) for a site
 * present in only one view, so a partial side capture still yields a number.
 */
export function computeCircumferences(front: SiteWidths, side: SiteWidths): Circumferences | null {
  const circ = (f: number | null, s: number | null): number | null => {
    if (f != null && s != null) return ellipseCircumference(f, s);
    const one = f ?? s;
    return one != null ? ellipseCircumference(one, one) : null;
  };
  const neckCm = circ(front.neckCm, side.neckCm);
  const waistCm = circ(front.waistCm, side.waistCm);
  if (neckCm == null || waistCm == null) return null;
  const hipsCm = circ(front.hipsCm, side.hipsCm);
  const chestCm = circ(front.chestCm, side.chestCm);
  const out: Circumferences = { neckCm, waistCm };
  if (hipsCm != null) out.hipsCm = hipsCm;
  if (chestCm != null) out.chestCm = chestCm;
  return out;
}
