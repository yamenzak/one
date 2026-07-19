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
  /** The SOURCE video frame's pixel dims. The mask is square (model input) but
   *  the frame usually isn't, so a horizontal width and a vertical (height-scale)
   *  span are squished by different factors — we correct widths by the aspect. */
  frameW: number;
  frameH: number;
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

/**
 * The contiguous body run on row `y` that contains the torso — seeded at the body
 * midline `midX` and grown left/right only through connected body pixels, clipped
 * to a torso window `[midX ± maxHalf]`. This is the crux of getting a real girth:
 * it drops a disconnected out-held hand/forearm blob entirely, AND caps a limb
 * that touches the torso, so arm pixels stop inflating waist/hip/chest widths
 * (an outstretched arm was reading a 293 cm "hip"). Returns null if no body sits
 * near the midline on this row.
 */
function torsoRun(mask: Float32Array, w: number, h: number, y: number, midX: number, maxHalf: number): { min: number; max: number } | null {
  const yi = Math.round(y);
  if (yi < 0 || yi >= h) return null;
  const base = yi * w;
  const lo = Math.max(0, Math.round(midX - maxHalf));
  const hi = Math.min(w - 1, Math.round(midX + maxHalf));
  let cx = Math.max(lo, Math.min(hi, Math.round(midX)));
  if (!(mask[base + cx]! > THRESH)) {
    // Midline landed on a segmentation gap — seed from the nearest body pixel.
    let seed = -1;
    for (let d = 1; d <= hi - lo; d++) {
      if (cx - d >= lo && mask[base + cx - d]! > THRESH) { seed = cx - d; break; }
      if (cx + d <= hi && mask[base + cx + d]! > THRESH) { seed = cx + d; break; }
    }
    if (seed < 0) return null;
    cx = seed;
  }
  let min = cx, max = cx;
  while (min - 1 >= lo && mask[base + min - 1]! > THRESH) min--;
  while (max + 1 <= hi && mask[base + max + 1]! > THRESH) max++;
  return { min, max };
}

/** Median torso width (px) across a few rows centered on y — robust to noise. */
function widthAt(mask: Float32Array, w: number, h: number, y: number, midX: number, maxHalf: number): number {
  const widths: number[] = [];
  for (let dy = -2; dy <= 2; dy++) {
    const ext = torsoRun(mask, w, h, y + dy, midX, maxHalf);
    if (ext) widths.push(ext.max - ext.min + 1);
  }
  if (widths.length === 0) return 0;
  widths.sort((a, b) => a - b);
  return widths[Math.floor(widths.length / 2)]!;
}

/** Scan a vertical band for the row of extreme (min|max) torso width. */
function extremeWidthRow(mask: Float32Array, w: number, h: number, yA: number, yB: number, mode: "min" | "max", midX: number, maxHalf: number): { y: number; width: number } {
  const lo = Math.max(0, Math.min(yA, yB));
  const hi = Math.min(h - 1, Math.max(yA, yB));
  let bestY = (lo + hi) / 2;
  let best = mode === "min" ? Infinity : -1;
  for (let y = Math.round(lo); y <= Math.round(hi); y++) {
    const ext = torsoRun(mask, w, h, y, midX, maxHalf);
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

/** 1-D moving-average smooth of a per-row edge series (odd window) — softens the
 *  row-to-row jaggedness of a low-res mask so the outline reads clean. */
function smooth(vals: number[], win = 5): number[] {
  const r = (win - 1) / 2;
  return vals.map((_, i) => {
    let s = 0, n = 0;
    for (let k = -r; k <= r; k++) { const j = i + k; if (j >= 0 && j < vals.length) { s += vals[j]!; n++; } }
    return s / n;
  });
}

/**
 * Trace a de-identified torso outline from the mask: sample rows across the body,
 * take each row's midline-anchored torso run (arms excluded), smooth the left &
 * right edges, and stitch a closed polygon (down the left, back up the right).
 * Normalized into the bbox so scans at different distances overlay for the morph.
 * ≤600 points.
 */
function extractContour(mask: Float32Array, w: number, h: number, midX: number, maxHalf: number, sampleRows = 160): [number, number][] {
  // Vertical body extent along the torso run (so arm-only rows don't extend it).
  let minY = h, maxY = -1;
  for (let y = 0; y < h; y++) {
    if (torsoRun(mask, w, h, y, midX, maxHalf)) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxY <= minY) return [];
  const rows = Math.min(sampleRows, Math.max(8, Math.floor((maxY - minY) / 2)));
  const ys: number[] = [], lx: number[] = [], rx: number[] = [];
  for (let i = 0; i <= rows; i++) {
    const y = minY + ((maxY - minY) * i) / rows;
    const ext = torsoRun(mask, w, h, y, midX, maxHalf);
    if (!ext) continue;
    ys.push(y); lx.push(ext.min); rx.push(ext.max);
  }
  if (ys.length < 3) return [];
  const sl = smooth(lx), sr = smooth(rx);
  let minX = w, maxX = -1;
  for (let i = 0; i < ys.length; i++) { if (sl[i]! < minX) minX = sl[i]!; if (sr[i]! > maxX) maxX = sr[i]!; }
  const bw = Math.max(1, maxX - minX);
  const bh = Math.max(1, maxY - minY);
  const q = (v: number) => Math.round(v * 1000) / 1000;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i < ys.length; i++) {
    const ny = (ys[i]! - minY) / bh;
    left.push([q((sl[i]! - minX) / bw), q(ny)]);
    right.push([q((sr[i]! - minX) / bw), q(ny)]);
  }
  const poly = [...left, ...right.reverse()];
  // Cap at 600 points (protocol limit) by even decimation.
  if (poly.length <= 600) return poly;
  const step = poly.length / 600;
  const out: [number, number][] = [];
  for (let i = 0; i < 600; i++) out.push(poly[Math.floor(i * step)]!);
  return out;
}

/** Full left→right body extent of a row — INCLUDES the arms (across the armpit
 *  gap), unlike the midline torso run. For the VISUALIZATION outline only. */
function rowExtentFull(mask: Float32Array, w: number, h: number, y: number): { min: number; max: number } | null {
  const yi = Math.round(y);
  if (yi < 0 || yi >= h) return null;
  const base = yi * w;
  let min = -1, max = -1;
  for (let x = 0; x < w; x++) if (mask[base + x]! > THRESH) { if (min < 0) min = x; max = x; }
  return min < 0 ? null : { min, max };
}

/**
 * Trace the FULL de-identified body outline — arms included — for the silhouette
 * and 3-D visualization. Meant for the arms-down "relax"/side capture (a natural
 * human shape), NOT for measurement (which stays torso-only). Same smoothing +
 * bbox-normalization as the torso outline so the two overlay for the morph.
 */
export function fullBodyContour(cap: Capture): [number, number][] {
  const { mask, width: w, height: h } = cap;
  let minY = h, maxY = -1;
  for (let y = 0; y < h; y++) if (rowExtentFull(mask, w, h, y)) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
  if (maxY <= minY) return [];
  const rows = Math.min(160, Math.max(8, Math.floor((maxY - minY) / 2)));
  const ys: number[] = [], lx: number[] = [], rx: number[] = [];
  for (let i = 0; i <= rows; i++) {
    const y = minY + ((maxY - minY) * i) / rows;
    const ext = rowExtentFull(mask, w, h, y);
    if (!ext) continue;
    ys.push(y); lx.push(ext.min); rx.push(ext.max);
  }
  if (ys.length < 3) return [];
  const sl = smooth(lx), sr = smooth(rx);
  let minX = w, maxX = -1;
  for (let i = 0; i < ys.length; i++) { if (sl[i]! < minX) minX = sl[i]!; if (sr[i]! > maxX) maxX = sr[i]!; }
  const bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
  const q = (val: number) => Math.round(val * 1000) / 1000;
  const left: [number, number][] = [], right: [number, number][] = [];
  for (let i = 0; i < ys.length; i++) {
    const ny = (ys[i]! - minY) / bh;
    left.push([q((sl[i]! - minX) / bw), q(ny)]);
    right.push([q((sr[i]! - minX) / bw), q(ny)]);
  }
  const poly: [number, number][] = [...left, ...right.reverse()];
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
  const { mask, width: w, height: h, landmarks: lm, frameW, frameH } = cap;

  const nose = lm[LM.nose];
  const lAnk = lm[LM.lAnkle];
  const rAnk = lm[LM.rAnkle];
  const lSh = lm[LM.lShoulder];
  const rSh = lm[LM.rShoulder];
  const lHip = lm[LM.lHip];
  const rHip = lm[LM.rHip];
  if (!nose || !lSh || !rSh || !lHip || !rHip) return { pxPerCm: null, neckCm: null, chestCm: null, waistCm: null, hipsCm: null, contour: [] };

  const noseY = nose.y * h;
  const shoulderY = ((lSh.y + rSh.y) / 2) * h;
  const hipY = ((lHip.y + rHip.y) / 2) * h;
  const torso = Math.max(1, hipY - shoulderY);

  // Torso midline + horizontal search window. Arms reach past the shoulder/hip
  // joints, so bound every width/contour scan to a window sized from those joints
  // (frontal) and grow the run only through connected pixels. A SIDE capture has
  // a near-zero shoulder span (joints overlap in x) — don't clip it; the
  // contiguous run alone is enough and dropping disconnected blobs still applies.
  const midX = Math.max(0, Math.min(w - 1, ((lSh.x + rSh.x + lHip.x + rHip.x) / 4) * w));
  const shHalf = (Math.abs(lSh.x - rSh.x) / 2) * w;
  const hipHalf = (Math.abs(lHip.x - rHip.x) / 2) * w;
  const frontal = shHalf > w * 0.06;
  const maxHalf = frontal ? Math.max(shHalf, hipHalf) * 1.5 : w;

  const contour = extractContour(mask, w, h, midX, maxHalf);

  // px/cm scale. Prefer the full nose→ankle span (domain applies the 0.86 height
  // factor). But feet are very often out of frame on a phone held at chest
  // height, so fall back to the nose→hip span (nose ≈0.93·H, hip ≈0.53·H →
  // ≈0.40·H) — that lets a head-to-thigh capture still calibrate instead of
  // failing outright. (Both are self-calibrated per frame.)
  const ankleY = Math.max(vis(lAnk) > 0.5 ? (lAnk?.y ?? 0) : 0, vis(rAnk) > 0.5 ? (rAnk?.y ?? 0) : 0) * h;
  let pxPerCm: number | null = ankleY > noseY ? pixelScaleFromHeight(ankleY - noseY, heightCm) : null;
  if (!pxPerCm && hipY > noseY && heightCm > 0) pxPerCm = (hipY - noseY) / (heightCm * NOSE_TO_HIP_FRACTION);

  // Aspect correction: pxPerCm is derived from a VERTICAL span (nose→ankle) in
  // mask-y px, but the sites are HORIZONTAL widths in mask-x px. The square mask
  // squishes the (non-square) frame differently per axis, so convert an x-width
  // into the y-scale's space by (real-px-per-mask-x)/(real-px-per-mask-y) before
  // dividing by pxPerCm. Without this, a portrait frame inflates every girth
  // ~frameH/frameW× (≈1.7), which read a 90 kg frame as 38 % body-fat.
  const aspect = frameW > 0 && frameH > 0 ? (frameW / w) / (frameH / h) : 1;
  const toCm = (px: number): number | null => (pxPerCm && px > 0 ? clampF((px * aspect) / pxPerCm) : null);

  // Neck: narrowest row just above the shoulders (between head and shoulders).
  const neck = extremeWidthRow(mask, w, h, shoulderY - torso * 0.28, shoulderY - torso * 0.04, "min", midX, maxHalf);
  // Chest: just below the shoulder line.
  const chestPx = widthAt(mask, w, h, shoulderY + torso * 0.2, midX, maxHalf);
  // Waist: narrowest torso row in the lower-mid torso.
  const waist = extremeWidthRow(mask, w, h, shoulderY + torso * 0.45, hipY - torso * 0.05, "min", midX, maxHalf);
  // Hips: widest row around the hip landmark level.
  const hips = extremeWidthRow(mask, w, h, hipY - torso * 0.05, hipY + torso * 0.15, "max", midX, maxHalf);

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
