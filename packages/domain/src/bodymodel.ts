/**
 * Body model (SPEC §8.5) — PURE geometry + classification the camera scan layers
 * on top of raw pixels so silhouettes and the 3-D figure read as a real body
 * instead of a noisy blob:
 *
 *  - `bodyProfile()` fits the measured girths to a STANDARD proportioned skeleton
 *    (anthropometric station heights), splitting each circumference into a front
 *    half-width + side half-depth via a body-fat-modulated aspect ratio, and
 *    filling unmeasured stations (head, shoulders, thighs, calves…) from the
 *    reference figure scaled to the person's build. The result is a clean set of
 *    slices — never weirdly shaped — that both the 2-D silhouette and the 3-D
 *    reconstruction render from. A captured outline can be blended in for
 *    correctness without letting its noise dominate the shape.
 *  - `classifySomatotype()` — an approximate ecto/meso/endomorph read. Real
 *    Heath–Carter needs skinfold calipers; this derives ectomorphy from the
 *    height–weight ratio (the one Carter component that only needs H+W) and
 *    approximates endomorphy from body-fat% and mesomorphy from FFMI. Screening,
 *    not a clinical somatotype.
 *  - `posturalMetrics()` / `classifyPosture()` — a sagittal screen from the SIDE
 *    view's ear/shoulder/hip landmarks: craniovertebral angle (forward-head) and
 *    trunk tilt, with a coarse severity. A single side photo depends on stance
 *    and camera, so this is a wellness screen, NOT a medical diagnosis.
 */

import type { Gender } from "./nutrition.js";

// ── Somatotype (approximate) ─────────────────────────────────────────────────

export type Somatotype = "ectomorph" | "mesomorph" | "endomorph";
export interface SomatotypeResult {
  /** 3 Heath–Carter-style components (~1–9). Approximate — see module note. */
  endo: number;
  meso: number;
  ecto: number;
  /** The dominant component. */
  dominant: Somatotype;
  /** Human label, hyphenated when two components are close (e.g. "Meso-endomorph"). */
  label: string;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Carter ectomorphy from the height–weight ratio (HWR = height / ∛weight). */
export function ectomorphyFromHWR(heightCm: number, weightKg: number): number {
  if (!(heightCm > 0) || !(weightKg > 0)) return 0;
  const hwr = heightCm / Math.cbrt(weightKg);
  let e: number;
  if (hwr >= 40.75) e = 0.732 * hwr - 28.58;
  else if (hwr > 38.25) e = 0.463 * hwr - 17.63;
  else e = 0.1;
  return clamp(e, 0.1, 9);
}

const CAP: Record<Somatotype, string> = { ectomorph: "Ectomorph", mesomorph: "Mesomorph", endomorph: "Endomorph" };
const ADJ: Record<Somatotype, string> = { ectomorph: "ecto", mesomorph: "meso", endomorph: "endo" };

/**
 * Approximate somatotype from body-fat%, FFMI and height/weight. Endomorphy
 * tracks fatness (body-fat%), mesomorphy tracks lean robustness (FFMI), and
 * ectomorphy is Carter's HWR component. Not a caliper-based Heath–Carter reading.
 */
export function classifySomatotype(input: {
  heightCm: number;
  weightKg: number;
  bodyFatPercent: number;
  ffmi?: number | null;
}): SomatotypeResult | null {
  const { heightCm, weightKg, bodyFatPercent } = input;
  if (!(heightCm > 0) || !(weightKg > 0) || !(bodyFatPercent >= 0)) return null;
  const ecto = ectomorphyFromHWR(heightCm, weightKg);
  // Endomorphy from body-fat% — anchored so ~15% ≈ 3, ~25% ≈ 5.3, ~35% ≈ 7.6.
  const endo = clamp(0.23 * bodyFatPercent - 0.45, 1, 9);
  // Mesomorphy from FFMI — anchored so ~18 ≈ 3.5, ~22 ≈ 6.3, ~25 ≈ 8.4.
  const ffmi = input.ffmi ?? null;
  const meso = ffmi != null ? clamp(0.7 * (ffmi - 13), 1, 9) : clamp(0.7 * (18 - 13), 1, 9);

  const ranked = ([["endomorph", endo], ["mesomorph", meso], ["ectomorph", ecto]] as [Somatotype, number][])
    .sort((a, b) => b[1] - a[1]);
  const [top, second] = ranked;
  const dominant = top![0];
  // Two components within ~1.0 → a hyphenated "adjective-dominant" label.
  const label = second && top![1] - second[1] <= 1
    ? `${cap(ADJ[second[0]])}-${dominant}`.replace(/^(\w)/, (m) => m) // e.g. "Meso-endomorph"
    : CAP[dominant];
  return { endo: r1(endo), meso: r1(meso), ecto: r1(ecto), dominant, label };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ── Posture (sagittal screen from the side view) ─────────────────────────────

export type PostureSeverity = "good" | "mild" | "moderate" | "severe";
export interface Pt2 { x: number; y: number }
export interface PostureResult {
  /** Craniovertebral-style angle (deg): the neck line vs horizontal at the
   *  shoulder. Higher = more upright; lower = more forward-head. */
  craniovertebralAngleDeg: number;
  /** Trunk lean from vertical (deg), shoulder→hip line. */
  trunkTiltDeg: number;
  severity: PostureSeverity;
  /** Short, plain flags e.g. "Forward head", "Trunk lean". */
  flags: string[];
}

/** Ordinal so a series/worst-of can compare severities. */
export const POSTURE_RANK: Record<PostureSeverity, number> = { good: 0, mild: 1, moderate: 2, severe: 3 };

/** Non-diagnostic guidance per severity — wellness framing, never medical advice. */
export const POSTURE_GUIDANCE: Record<PostureSeverity, string> = {
  good: "Your standing alignment looks balanced from the side.",
  mild: "A slight forward-head or lean — easy to nudge with posture breaks and upper-back work.",
  moderate: "A noticeable forward-head/lean pattern. Mobility and postural strengthening can help; re-scan to track it.",
  severe: "A pronounced alignment shift from the side. This is only a photo screen — if it comes with pain or stiffness, consider seeing a professional.",
};

/**
 * Sagittal posture from side-view landmark pixels (image space, y DOWN). Uses the
 * visible ear, shoulder and hip. Coarse severity thresholds — a single photo is a
 * screen, not a clinical postural exam.
 */
export function posturalMetrics(pts: { ear: Pt2; shoulder: Pt2; hip: Pt2 }): PostureResult | null {
  const { ear, shoulder, hip } = pts;
  if (!ear || !shoulder || !hip) return null;
  const torso = Math.abs(shoulder.y - hip.y);
  if (!(torso > 1)) return null; // degenerate

  // CVA: angle between horizontal and the shoulder→ear line. Ear sits above the
  // shoulder (smaller y), so dy = shoulder.y - ear.y > 0; dx is the horizontal
  // gap. A vertical neck → ~90°; a forward head lays the line down → smaller.
  const dy = Math.max(0, shoulder.y - ear.y);
  const dx = Math.abs(ear.x - shoulder.x);
  const cva = (Math.atan2(dy, dx) * 180) / Math.PI;

  // Trunk tilt: shoulder→hip line vs vertical.
  const tilt = (Math.atan2(Math.abs(shoulder.x - hip.x), Math.abs(hip.y - shoulder.y)) * 180) / Math.PI;

  const flags: string[] = [];
  // Forward-head thresholds (screening): upright necks read high; < ~50° drifts
  // forward. We express severity off the CVA and the trunk lean, worst wins.
  let sev = 0;
  if (cva < 44) { sev = Math.max(sev, 3); flags.push("Forward head"); }
  else if (cva < 48) { sev = Math.max(sev, 2); flags.push("Forward head"); }
  else if (cva < 52) { sev = Math.max(sev, 1); flags.push("Mild forward head"); }

  if (tilt > 15) { sev = Math.max(sev, 3); flags.push("Trunk lean"); }
  else if (tilt > 10) { sev = Math.max(sev, 2); flags.push("Trunk lean"); }
  else if (tilt > 6) { sev = Math.max(sev, 1); flags.push("Slight lean"); }

  const severity = (["good", "mild", "moderate", "severe"] as PostureSeverity[])[sev]!;
  return { craniovertebralAngleDeg: r1(cva), trunkTiltDeg: r1(tilt), severity, flags };
}

// ── Standard body profile (measurement → clean slices) ───────────────────────

/** A cross-section of the figure at height fraction `t` (0 = crown, 1 = sole). */
export interface BodySlice {
  /** 0 at the top of the head → 1 at the soles. */
  t: number;
  /** Half the body WIDTH here (frontal, X), cm. */
  halfWidthCm: number;
  /** Half the body DEPTH here (sagittal, Z), cm. */
  halfDepthCm: number;
}

export interface BodyProfile {
  heightCm: number;
  slices: BodySlice[];
  /** Estimated biacromial (shoulder) width, cm — handy as its own read. */
  shoulderWidthCm: number;
}

/**
 * Reference proportions for a lean adult, as fractions of standing height:
 * station heights (t) plus a frontal half-WIDTH and sagittal half-DEPTH. Measured
 * sites (neck/chest/waist/hip) override these; the rest scale to the person's
 * build. `aspect` = width:depth used to split a measured girth into a & b.
 */
interface Station { key: string; t: number; hw: number; hd: number; aspect: number }
const REF: Station[] = [
  { key: "head", t: 0.045, hw: 0.043, hd: 0.055, aspect: 0.78 },
  { key: "neck", t: 0.17, hw: 0.035, hd: 0.043, aspect: 0.9 },
  { key: "shoulder", t: 0.205, hw: 0.115, hd: 0.06, aspect: 1.9 },
  { key: "chest", t: 0.29, hw: 0.10, hd: 0.09, aspect: 1.35 },
  { key: "waist", t: 0.37, hw: 0.078, hd: 0.066, aspect: 1.4 },
  { key: "hip", t: 0.475, hw: 0.098, hd: 0.083, aspect: 1.32 },
  { key: "thigh", t: 0.60, hw: 0.088, hd: 0.083, aspect: 1.05 },
  { key: "knee", t: 0.72, hw: 0.052, hd: 0.055, aspect: 0.95 },
  { key: "calf", t: 0.81, hw: 0.056, hd: 0.058, aspect: 0.97 },
  { key: "ankle", t: 0.955, hw: 0.03, hd: 0.038, aspect: 0.8 },
  { key: "sole", t: 1.0, hw: 0.026, hd: 0.05, aspect: 0.55 },
];

/** π-based ellipse split: girth C + width:depth aspect ρ → {a: half-width, b: half-depth}. */
function splitGirth(circumferenceCm: number, aspect: number): { a: number; b: number } {
  const s = circumferenceCm / Math.PI; // a + b
  const b = s / (1 + aspect);
  return { a: aspect * b, b };
}

/**
 * Fit the measured girths to the standard skeleton and return clean cross-section
 * slices. Circumferences are split into width/depth by a body-fat-rounded aspect
 * (leaner → more elliptical, fatter → rounder). Unmeasured stations scale by the
 * ratio the measured ones imply, so the whole figure grows/shrinks coherently.
 */
export function bodyProfile(input: {
  heightCm: number;
  neckCm?: number | null;
  chestCm?: number | null;
  waistCm?: number | null;
  hipsCm?: number | null;
  bodyFatPercent?: number | null;
}): BodyProfile | null {
  const H = input.heightCm;
  if (!(H > 0)) return null;
  const bf = input.bodyFatPercent ?? 22;
  // Leaner bodies keep the reference ellipticity; fatter bodies round toward a
  // circle (aspect → 1). 12% ≈ full ref, ~32% ≈ half-way to round.
  const lean = clamp(1 - (bf - 12) / 40, 0.35, 1);

  const measured: Record<string, number> = {};
  if (input.neckCm) measured.neck = input.neckCm;
  if (input.chestCm) measured.chest = input.chestCm;
  if (input.waistCm) measured.waist = input.waistCm;
  if (input.hipsCm) measured.hip = input.hipsCm;

  // Build scale: how the measured sites compare to the reference figure at this
  // height. Averaged so unmeasured stations move with the person's overall size.
  const ratios: number[] = [];
  for (const st of REF) {
    const c = measured[st.key];
    if (c == null) continue;
    const refHalfSum = (st.hw + st.hd) * H; // reference (a+b) in cm
    const measHalfSum = c / Math.PI; // measured (a+b)
    if (refHalfSum > 0) ratios.push(measHalfSum / refHalfSum);
  }
  const build = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 1;
  // Fatter figures carry a touch more on the limbs even beyond the girth build.
  const limb = build * (1 + Math.max(0, bf - 18) / 160);

  const slices: BodySlice[] = REF.map((st) => {
    const c = measured[st.key];
    if (c != null) {
      const aspectEff = 1 + (st.aspect - 1) * lean;
      const { a, b } = splitGirth(c, aspectEff);
      return { t: st.t, halfWidthCm: a, halfDepthCm: b };
    }
    const scale = st.key === "head" || st.key === "neck" || st.key === "shoulder" ? build : limb;
    return { t: st.t, halfWidthCm: st.hw * H * scale, halfDepthCm: st.hd * H * scale };
  });

  const shoulder = slices.find((_, i) => REF[i]!.key === "shoulder")!;
  return { heightCm: H, slices, shoulderWidthCm: r1(shoulder.halfWidthCm * 2) };
}

// ── Profile → render points ──────────────────────────────────────────────────

export type Pt = [number, number];

/** Monotone-ish sample of the profile to `n` rows via linear interp of the half
 *  extents between stations (stations are already smooth control widths). */
function sampleProfile(slices: BodySlice[], n: number, pick: (s: BodySlice) => number): { t: number; half: number }[] {
  const out: { t: number; half: number }[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    let a = slices[0]!, b = slices[slices.length - 1]!;
    for (let k = 0; k < slices.length - 1; k++) {
      if (t >= slices[k]!.t && t <= slices[k + 1]!.t) { a = slices[k]!; b = slices[k + 1]!; break; }
    }
    const span = b.t - a.t || 1;
    const f = clamp((t - a.t) / span, 0, 1);
    // smoothstep for gentle shoulders/waist transitions
    const fs = f * f * (3 - 2 * f);
    out.push({ t, half: pick(a) + (pick(b) - pick(a)) * fs });
  }
  return out;
}

/**
 * Build a closed silhouette polygon from the profile, NORMALIZED to 0..1 in both
 * axes (the same coordinate space the stored capture contours use, so it's a
 * drop-in for the same renderer). `box`'s aspect (width:height) is how the figure
 * is fit; `view: "front"` uses half-WIDTH, `"side"` uses half-DEPTH. Centered,
 * with a small margin.
 */
export function profileToSilhouette(
  profile: BodyProfile,
  box: { width: number; height: number },
  view: "front" | "side",
  rows = 72,
): Pt[] {
  const pick = view === "front" ? (s: BodySlice) => s.halfWidthCm : (s: BodySlice) => s.halfDepthCm;
  const rowsArr = sampleProfile(profile.slices, rows, pick);
  const maxHalf = Math.max(...rowsArr.map((r) => r.half)) || 1;
  const margin = 0.92;
  // px per cm from height, then clamp so the widest slice still fits the box.
  let scale = (box.height * margin) / profile.heightCm;
  if (maxHalf * scale > (box.width / 2) * margin) scale = ((box.width / 2) * margin) / maxHalf;
  const cx = box.width / 2;
  const topY = (box.height - profile.heightCm * scale) / 2;
  const right: Pt[] = [];
  const left: Pt[] = [];
  for (const r of rowsArr) {
    const y = (topY + r.t * profile.heightCm * scale) / box.height;
    const half = (r.half * scale) / box.width;
    right.push([cx / box.width + half, y]);
    left.push([cx / box.width - half, y]);
  }
  return [...right, ...left.reverse()];
}
