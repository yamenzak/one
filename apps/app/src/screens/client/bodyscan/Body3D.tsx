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

type Pt = [number, number];
interface Vert { x: number; y: number; z: number }
interface Face { i: number[]; }

const LEVELS = 34; // vertical slices
const ANG = 24; // points around each slice
const DEPTH_RATIO = 0.6; // deepest slice depth as a fraction of widest width

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

export function Body3D({ front, side, width = 220, height = 320, className }: {
  front: Pt[];
  side: Pt[] | null;
  width?: number;
  height?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colorRef = useRef<HTMLDivElement>(null);
  const mesh = useMemo(() => buildMesh(front, side), [front, side]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    // Resolve the accent to concrete rgb so shading works on any tenant colour.
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
      {/* Resolves the accent CSS var to rgb for canvas shading. */}
      <div ref={colorRef} style={{ color: "var(--color-cardio)", width: 0, height: 0, position: "absolute" }} />
      <canvas ref={canvasRef} style={{ width, height, touchAction: "none", cursor: "grab" }} aria-label="Rotatable 3-D body from your silhouettes" />
    </div>
  );
}
