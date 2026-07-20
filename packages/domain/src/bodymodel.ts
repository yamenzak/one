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

// ── Humanoid figure (head + arms + separated legs) ───────────────────────────

/** Half-extent (cm) at height fraction t, front width or side depth, interpolated. */
function halfAt(profile: BodyProfile, t: number, view: "front" | "side"): number {
  const s = profile.slices;
  const pick = view === "front" ? (x: BodySlice) => x.halfWidthCm : (x: BodySlice) => x.halfDepthCm;
  if (t <= s[0]!.t) return pick(s[0]!);
  for (let k = 0; k < s.length - 1; k++) {
    if (t <= s[k + 1]!.t) { const a = s[k]!, b = s[k + 1]!; const f = (t - a.t) / ((b.t - a.t) || 1); return pick(a) + (pick(b) - pick(a)) * f; }
  }
  return pick(s[s.length - 1]!);
}

/** Catmull–Rom through a CLOSED loop of control points → a smooth polygon. */
function smoothClosed(cps: Pt[], per = 6): Pt[] {
  const n = cps.length, out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = cps[(i - 1 + n) % n]!, p1 = cps[i]!, p2 = cps[(i + 1) % n]!, p3 = cps[(i + 2) % n]!;
    for (let j = 0; j < per; j++) {
      const t = j / per, t2 = t * t, t3 = t2 * t;
      const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      out.push([x, y]);
    }
  }
  return out;
}

/**
 * A full human FIGURE outline (head, arms at the sides, separated legs) fitted to
 * the measured profile — the recognizable body-shape the scan should read as,
 * not an armless column. Control points are laid out in body proportions and
 * scaled by the profile's per-height widths (front) or depths (side), then
 * smoothed and normalized to 0..1 (aspect-preserving) for <Silhouette>.
 */
export function humanoidSilhouette(profile: BodyProfile, view: "front" | "side", box = { width: 190, height: 300 }): Pt[] {
  const H = profile.heightCm;
  const f = (t: number) => halfAt(profile, t, view) / H; // half-extent as a fraction of height
  let right: Pt[];
  if (view === "front") {
    const S = Math.max(profile.shoulderWidthCm / 2 / H, f(0.29) * 1.15); // shoulder half
    const headW = Math.max(f(0.05), 0.05), neckW = Math.max(f(0.16), 0.03);
    const chestW = f(0.30), waistW = f(0.37), hipW = f(0.47);
    // Limbs get anatomical widths on their OWN centerlines — deriving leg width
    // straight from the body half-profile (which spans BOTH legs) made each leg
    // half as thick as it should be ("chicken legs").
    const armCx = S * 0.86; // arm centerline
    const upH = Math.max(S * 0.17, chestW * 0.17); // upper-arm half-width
    const foH = upH * 0.8; // forearm half-width
    const legCx = hipW * 0.5; // each leg's centerline (kept vertical)
    const thH = Math.max(f(0.60) * 0.46, hipW * 0.42); // thigh half-width
    const knH = thH * 0.66, caH = thH * 0.82, anH = thH * 0.46, ftH = thH * 0.66; // knee/calf(bulge)/ankle/foot
    const gap = 0.018; // half-gap at the crotch
    right = [
      [0, 0.02], [headW * 0.62, 0.03], [headW, 0.062], [headW * 0.82, 0.108], // rounded head
      [neckW, 0.135], [neckW, 0.163], // neck
      [S * 0.72, 0.176], [S, 0.20], // trapezius → deltoid
      [armCx + upH, 0.245], [armCx + upH, 0.34], [armCx + foH, 0.44], [armCx + foH, 0.512], // outer arm
      [armCx + foH * 0.85, 0.552], [armCx, 0.575], // hand
      [armCx - foH, 0.55], [armCx - foH, 0.44], [armCx - upH, 0.34], [armCx - upH, 0.268], // inner arm → armpit
      [chestW, 0.30], [waistW, 0.375], [hipW, 0.46], // torso
      [legCx + thH, 0.55], [legCx + knH, 0.715], [legCx + caH, 0.80], [legCx + anH, 0.945], // right leg outer (thigh→calf→ankle)
      [legCx + ftH, 0.986], [legCx + ftH * 0.2, 1.0], // foot
      [legCx - anH, 0.99], [legCx - caH, 0.82], [legCx - knH, 0.715], [legCx - thH, 0.55], [gap, 0.52], // inner leg → crotch
    ];
  } else {
    // Side profile: front edge (belly/chest) down, then back edge (spine/seat) up.
    const bf = 20; // belly bulge is baked into the depth via profile; a touch extra low-torso
    void bf;
    const headD = Math.max(f(0.05), 0.055), neckD = Math.max(f(0.16), 0.04);
    const chestD = f(0.30), waistD = f(0.37), hipD = f(0.47);
    const thigh = f(0.60), knee = f(0.72), calf = f(0.81), ankle = Math.max(f(0.955), 0.03);
    right = [
      [0, 0.006], [headD * 0.95, 0.03], [headD, 0.06], [headD * 0.7, 0.10], // front of head/face
      [neckD * 0.8, 0.135], [neckD * 1.1, 0.165], // throat
      [chestD, 0.29], [waistD * 1.08, 0.37], [hipD * 0.92, 0.46], // chest → belly → front hip
      [thigh, 0.585], [knee, 0.715], [calf * 0.95, 0.805], [ankle * 1.05, 0.95], // front thigh → shin
      [ankle * 1.9, 0.985], [ankle * 1.7, 1.0], [-ankle * 1.3, 1.0], [-ankle * 1.15, 0.985], // foot: toe → sole → heel
      [-calf, 0.83], [-knee, 0.715], [-thigh * 1.05, 0.6], // calf back → thigh back
      [-hipD * 1.15, 0.475], [-waistD, 0.37], [-chestD * 1.02, 0.29], // seat/buttock → lower back → upper back
      [-neckD, 0.17], [-neckD * 0.9, 0.14], [-headD * 1.05, 0.075], [-headD * 0.7, 0.028], // back of neck/head
    ];
  }
  const left = view === "front" ? right.map(([x, y]) => [-x, y] as Pt).reverse() : [];
  const loop = smoothClosed([...right, ...left]);

  // Aspect-preserving fit into the box, normalized to 0..1.
  const ys = loop.map((p) => p[1]);
  const maxX = Math.max(...loop.map((p) => Math.abs(p[0]))) || 1;
  const minY = Math.min(...ys), maxY = Math.max(...ys), spanY = maxY - minY || 1;
  const aspect = box.height / box.width;
  let sc = 0.96; // normalized-y units for the full figure height
  if (maxX * sc * aspect > 0.46) sc = 0.46 / (maxX * aspect);
  const yScale = sc / spanY;
  const yOff = (1 - sc) / 2;
  return loop.map(([x, y]) => [0.5 + x * sc * aspect, yOff + (y - minY) * yScale] as Pt);
}
