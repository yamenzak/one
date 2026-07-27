/**
 * A rotatable 3-D body built from the two de-identified silhouettes — front gives
 * the WIDTH at each height, side gives the DEPTH, so every height slice becomes an
 * ellipse; stack them into a mesh and shade it. Pure canvas 2-D (no three.js): the
 * mesh is a few hundred quads, painter-sorted and Lambert-shaded each frame, so it
 * stays tiny and dependency-free. Nothing but the stored 0..1 outlines is used —
 * still no photo, still on-device.
 *
 * The outlines are each bbox-normalized independently, so the true width:depth
 * ratio is lost; we rescale depth to a natural human proportion (a body is wider
 * than it is deep). It's a faithful *shape* visualization, not a metric model.
 */

import { useEffect, useMemo, useRef } from "react";
import type { BodySlice, BodyProfile } from "@mossa/domain";

type Pt = [number, number];
interface Vert { x: number; y: number; z: number }
interface Face { i: number[]; }

const LEVELS = 34; // vertical slices
const ANG = 24; // points around each slice
const DEPTH_RATIO = 0.6; // deepest slice depth as a fraction of widest width
const RING = 20; // points around each limb/torso ring in the humanoid mesh

/** A cross-section along a body part: centerline (cx,cz) + ellipse radii at height t. */
interface Section { t: number; cx: number; cz: number; rx: number; rz: number }

/**
 * A HUMAN mesh — head, neck, torso, two arms, two legs — built as separate
 * tubes of stacked ellipse rings from the measurement profile, so the 3-D reads
 * as a body (not an armless column). Widths mirror the 2-D figure. All parts
 * merge into one verts/faces set for the painter renderer below.
 */
function humanMesh(profile: BodyProfile): { verts: Vert[]; faces: Face[] } {
  const H = profile.heightCm, S0 = profile.slices;
  const interp = (t: number, pick: (s: BodySlice) => number): number => {
    if (t <= S0[0]!.t) return pick(S0[0]!);
    for (let k = 0; k < S0.length - 1; k++) if (t <= S0[k + 1]!.t) { const a = S0[k]!, b = S0[k + 1]!; return pick(a) + (pick(b) - pick(a)) * ((t - a.t) / ((b.t - a.t) || 1)); }
    return pick(S0[S0.length - 1]!);
  };
  const hw = (t: number) => interp(t, (s) => s.halfWidthCm), hd = (t: number) => interp(t, (s) => s.halfDepthCm);
  const yOf = (t: number) => (0.5 - t) * H;
  const S = Math.max(profile.shoulderWidthCm / 2, hw(0.29) * 1.12);
  const chestW = hw(0.30), hipW = hw(0.47);
  const neckR = Math.max(hw(0.16), 0.03 * H);
  const headRx = Math.max(hw(0.05), 0.05 * H), headRz = Math.max(hd(0.05), 0.05 * H) * 0.98;
  const armCx = S * 0.82, upR = Math.max(S * 0.17, chestW * 0.17), foR = upR * 0.82, handR = foR * 0.72;
  const legCx = hipW * 0.52, thR = Math.max(hw(0.60) * 0.46, hipW * 0.42), knR = thR * 0.66, caR = thR * 0.82, anR = thR * 0.5;

  const verts: Vert[] = [], faces: Face[] = [];
  const addPart = (secs: Section[]) => {
    const base = verts.length;
    for (const s of secs) for (let j = 0; j < RING; j++) { const a = (j / RING) * Math.PI * 2; verts.push({ x: s.cx + s.rx * Math.cos(a), y: yOf(s.t), z: s.cz + s.rz * Math.sin(a) }); }
    for (let i = 0; i < secs.length - 1; i++) for (let j = 0; j < RING; j++) { const j2 = (j + 1) % RING; faces.push({ i: [base + i * RING + j, base + i * RING + j2, base + (i + 1) * RING + j2, base + (i + 1) * RING + j] }); }
  };

  const head: Section[] = [];
  for (let i = 0; i <= 8; i++) { const u = i / 8, t = 0.02 + (0.135 - 0.02) * u, rf = Math.sqrt(Math.max(0.16, 1 - (2 * u - 1) ** 2)); head.push({ t, cx: 0, cz: 0, rx: headRx * rf, rz: headRz * rf }); }
  addPart(head);
  addPart([{ t: 0.11, cx: 0, cz: 0, rx: neckR * 0.95, rz: neckR * 0.9 }, { t: 0.16, cx: 0, cz: 0, rx: neckR, rz: neckR * 0.95 }, { t: 0.215, cx: 0, cz: 0, rx: neckR * 1.4, rz: neckR * 1.2 }]);
  const torso: Section[] = [];
  for (let i = 0; i <= 14; i++) { const u = i / 14, t = 0.17 + (0.505 - 0.17) * u; torso.push({ t, cx: 0, cz: 0, rx: hw(t) * 0.98, rz: hd(t) }); }
  addPart(torso);
  const armRad = (u: number) => (u < 0.5 ? upR + (foR - upR) * (u / 0.5) : foR + (handR - foR) * ((u - 0.5) / 0.5));
  for (const sgn of [1, -1]) { const arm: Section[] = []; for (let i = 0; i <= 9; i++) { const u = i / 9, t = 0.205 + (0.57 - 0.205) * u, r = armRad(u); arm.push({ t, cx: sgn * armCx, cz: 0, rx: r, rz: r }); } addPart(arm); }
  const legRad = (u: number) => (u < 0.45 ? thR + (knR - thR) * (u / 0.45) : u < 0.72 ? knR + (caR - knR) * ((u - 0.45) / 0.27) : caR + (anR - caR) * ((u - 0.72) / 0.28));
  for (const sgn of [1, -1]) { const leg: Section[] = []; for (let i = 0; i <= 11; i++) { const u = i / 11, t = 0.50 + (0.99 - 0.50) * u, r = legRad(u), foot = u > 0.92; leg.push({ t, cx: sgn * legCx, cz: foot ? (u - 0.92) * 0.06 * H : 0, rx: r, rz: foot ? r * 1.7 : r }); } addPart(leg); }
  return { verts, faces };
}
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Preferred mesh path: the measurement-driven profile carries TRUE width & depth
 * in cm per height, so we build ellipses directly — no bbox-normalization, no
 * aspect guessing. Vertical is cm too, so proportions come out right on their own.
 */
function meshFromSlices(slices: BodySlice[], heightCm: number): { verts: Vert[]; faces: Face[] } {
  const verts: Vert[] = [];
  for (let i = 0; i <= LEVELS; i++) {
    const t = i / LEVELS;
    let a = slices[0]!, b = slices[slices.length - 1]!;
    for (let k = 0; k < slices.length - 1; k++) {
      if (t >= slices[k]!.t && t <= slices[k + 1]!.t) { a = slices[k]!; b = slices[k + 1]!; break; }
    }
    const span = b.t - a.t || 1;
    const f = clamp01((t - a.t) / span);
    const fs = f * f * (3 - 2 * f); // smoothstep — gentle shoulders/waist
    const halfW = a.halfWidthCm + (b.halfWidthCm - a.halfWidthCm) * fs;
    const depthHalf = a.halfDepthCm + (b.halfDepthCm - a.halfDepthCm) * fs;
    const yy = (0.5 - t) * heightCm; // head up, in cm so it shares scale with widths
    for (let j = 0; j < ANG; j++) {
      const th = (j / ANG) * Math.PI * 2;
      verts.push({ x: halfW * Math.cos(th), y: yy, z: depthHalf * Math.sin(th) });
    }
  }
  const faces: Face[] = [];
  const nRows = LEVELS + 1;
  for (let i = 0; i < nRows - 1; i++) {
    for (let j = 0; j < ANG; j++) {
      const j2 = (j + 1) % ANG;
      faces.push({ i: [i * ANG + j, i * ANG + j2, (i + 1) * ANG + j2, (i + 1) * ANG + j] });
    }
  }
  return { verts, faces };
}

/** Left/right (or front/back) extent of an outline at height y, within a band. */
function sliceAt(contour: Pt[], y: number, band = 0.03): [number, number] | null {
  let lo = Infinity, hi = -Infinity;
  for (const p of contour) if (Math.abs(p[1] - y) <= band) { if (p[0] < lo) lo = p[0]; if (p[0] > hi) hi = p[0]; }
  return hi < lo ? null : [lo, hi];
}

/** Build the stacked-ellipse mesh from front (width) + side (depth) outlines. */
function buildMesh(front: Pt[], side: Pt[] | null): { verts: Vert[]; faces: Face[] } {
  const rows: { y: number; cx: number; halfW: number; depth: number }[] = [];
  let maxW = 0.0001, maxD = 0.0001;
  for (let i = 0; i <= LEVELS; i++) {
    const y = i / LEVELS;
    const fw = sliceAt(front, y);
    if (!fw) continue;
    const w = fw[1] - fw[0];
    const sd = side ? sliceAt(side, y) : null;
    const d = sd ? sd[1] - sd[0] : w * 0.66; // no side → rounded approximation
    maxW = Math.max(maxW, w);
    maxD = Math.max(maxD, d);
    rows.push({ y, cx: (fw[0] + fw[1]) / 2 - 0.5, halfW: w / 2, depth: d });
  }
  // Normalize depth into a natural proportion relative to the widest width.
  const depthScale = side ? (DEPTH_RATIO * maxW) / maxD : 1;
  const verts: Vert[] = [];
  for (const r of rows) {
    const a = r.halfW; // semi-axis across (x)
    const b = (r.depth * depthScale) / 2; // semi-axis deep (z)
    const yy = 0.5 - r.y; // flip: head (y=0) up
    for (let j = 0; j < ANG; j++) {
      const t = (j / ANG) * Math.PI * 2;
      verts.push({ x: r.cx + a * Math.cos(t), y: yy, z: b * Math.sin(t) });
    }
  }
  // The outlines are bbox-normalized (aspect lost), so width≈height → a squat
  // blob. Rescale the horizontal so the body reads at a natural proportion
  // (~this many × taller than its widest point) instead of a barrel.
  const TARGET_ASPECT = 3.4;
  let maxR = 1e-4, maxYv = 1e-4;
  for (const v of verts) { const r = Math.hypot(v.x, v.z); if (r > maxR) maxR = r; if (Math.abs(v.y) > maxYv) maxYv = Math.abs(v.y); }
  const sxz = (maxYv / TARGET_ASPECT) / maxR;
  for (const v of verts) { v.x *= sxz; v.z *= sxz; }
  const faces: Face[] = [];
  const nRows = rows.length;
  for (let i = 0; i < nRows - 1; i++) {
    for (let j = 0; j < ANG; j++) {
      const j2 = (j + 1) % ANG;
      const a = i * ANG + j, b = i * ANG + j2, c = (i + 1) * ANG + j2, d = (i + 1) * ANG + j;
      faces.push({ i: [a, b, c, d] });
    }
  }
  return { verts, faces };
}

export function Body3D({ profile, front, side, slices, heightCm, width = 220, height = 320, className }: {
  /** Preferred path — a full HUMAN figure (head, arms, legs) from the profile. */
  profile?: BodyProfile | null;
  /** Legacy path — reconstruct from the two stored outlines. */
  front?: Pt[] | null;
  side?: Pt[] | null;
  /** Fallback — a volumetric body column from the profile slices. */
  slices?: BodySlice[] | null;
  heightCm?: number | null;
  width?: number;
  height?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colorRef = useRef<HTMLDivElement>(null);
  const mesh = useMemo(
    () =>
      profile
        ? humanMesh(profile)
        : slices && slices.length > 1 && heightCm
          ? meshFromSlices(slices, heightCm)
          : buildMesh(front ?? [], side ?? null),
    [profile, slices, heightCm, front, side],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    // Resolve the accent to concrete rgb so shading works on any tenant colour.
    // design-tokens-exempt: a last-resort fallback for getComputedStyle, used only if the probe element is missing; the real value IS read from the theme on the line above.
    const resolved = colorRef.current ? getComputedStyle(colorRef.current).color : "rgb(120,180,255)";
    const m = resolved.match(/(\d+(?:\.\d+)?)/g);
    const base = m && m.length >= 3 ? [Number(m[0]), Number(m[1]), Number(m[2])] : [120, 180, 255];

    const { verts, faces } = mesh;
    const light = (() => { const l = [0.35, 0.5, 0.78]; const mm = Math.hypot(...l); return l.map((v) => v / mm); })();
    // Fit the body (at ANY rotation) inside the canvas: horizontal reach is the
    // max xz-radius, vertical is the max |y|.
    let maxR = 1e-4, maxY = 1e-4;
    for (const v of verts) { const r = Math.hypot(v.x, v.z); if (r > maxR) maxR = r; if (Math.abs(v.y) > maxY) maxY = Math.abs(v.y); }
    const scale = Math.min(((width / 2) * 0.9) / maxR, ((height / 2) * 0.92) / maxY);
    const cxp = width / 2, cyp = height / 2;

    let angle = -0.5;
    let dragging = false;
    let auto = true;
    let raf = 0;

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const ca = Math.cos(angle), sa = Math.sin(angle);
      // Rotate about the vertical axis, then orthographic project.
      const P = verts.map((v) => {
        const rx = v.x * ca - v.z * sa;
        const rz = v.x * sa + v.z * ca;
        return { sx: cxp + rx * scale, sy: cyp - v.y * scale, rx, ry: v.y, rz };
      });
      const drawn = faces
        .map((f) => {
          const q = f.i.map((k) => P[k]!);
          const depth = (q[0]!.rz + q[1]!.rz + q[2]!.rz + q[3]!.rz) / 4;
          return { q, depth };
        })
        .sort((a, b) => a.depth - b.depth); // far → near (painter's)
      for (const { q } of drawn) {
        // Face normal in rotated space → Lambert intensity.
        const ux = q[1]!.rx - q[0]!.rx, uy = q[1]!.ry - q[0]!.ry, uz = q[1]!.rz - q[0]!.rz;
        const vx = q[3]!.rx - q[0]!.rx, vy = q[3]!.ry - q[0]!.ry, vz = q[3]!.rz - q[0]!.rz;
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const nm = Math.hypot(nx, ny, nz) || 1; nx /= nm; ny /= nm; nz /= nm;
        const ndl = Math.max(0, nx * light[0]! + ny * light[1]! + nz * light[2]!);
        // Ambient + diffuse, with a soft rim highlight; concrete rgb so we can
        // also stroke the face and seal the anti-alias seams (no wireframe look).
        const f = 0.32 + 0.82 * ndl;
        const hl = ndl > 0.85 ? (ndl - 0.85) * 320 : 0;
        const col = `rgb(${Math.min(255, base[0]! * f + hl) | 0},${Math.min(255, base[1]! * f + hl) | 0},${Math.min(255, base[2]! * f + hl) | 0})`;
        ctx.beginPath();
        ctx.moveTo(q[0]!.sx, q[0]!.sy);
        ctx.lineTo(q[1]!.sx, q[1]!.sy);
        ctx.lineTo(q[2]!.sx, q[2]!.sy);
        ctx.lineTo(q[3]!.sx, q[3]!.sy);
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        ctx.fill();
        ctx.stroke();
      }
    };

    const tick = () => {
      if (auto && !dragging) angle += 0.012;
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    let lastX = 0, idle: ReturnType<typeof setTimeout>;
    const down = (e: PointerEvent) => { dragging = true; auto = false; lastX = e.clientX; clearTimeout(idle); canvas.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => { if (!dragging) return; angle += (e.clientX - lastX) * 0.01; lastX = e.clientX; };
    const up = () => { dragging = false; idle = setTimeout(() => { auto = true; }, 2500); };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(idle);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
    };
  }, [mesh, width, height]);

  return (
    <div className={className} style={{ width, height, position: "relative" }}>
      {/* A neutral clay gray reads as a clean anatomical model (the accent tint
          looked garish); Lambert shading below gives it form. */}
      {/* design-tokens-exempt: fed to a WebGL Lambert shader, not to CSS. A deliberate anatomical clay grey — see the note above; the brand accent read as garish on a body mesh. */}
      <div ref={colorRef} style={{ color: "rgb(166,170,182)", width: 0, height: 0, position: "absolute" }} />
      <canvas ref={canvasRef} style={{ width, height, touchAction: "none", cursor: "grab" }} aria-label="Rotatable 3-D body from your silhouettes" />
    </div>
  );
}
