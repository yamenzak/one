/**
 * Silhouette rendering + morph — pure SVG over the de-identified, bbox-normalized
 * outline polygons (0..1 points, never pixels). No MediaPipe here, so it stays
 * in the main bundle and powers both the result reveal (trace-in) and the
 * progress morph (crossfade between the earliest and latest scan).
 */

import { useMemo } from "react";

type Pt = [number, number];

/** Resample a polygon to exactly `n` points by arc length — lets two outlines
 *  with different point counts morph 1:1. */
function resample(poly: Pt[], n: number): Pt[] {
  if (poly.length < 2) return Array.from({ length: n }, () => [0.5, 0.5] as Pt);
  const segLen: number[] = [];
  let total = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segLen.push(d);
    total += d;
  }
  const out: Pt[] = [];
  const step = total / n;
  let seg = 0;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const target = i * step;
    while (seg < poly.length - 1 && acc + segLen[seg]! < target) { acc += segLen[seg]!; seg++; }
    const a = poly[seg]!;
    const b = poly[(seg + 1) % poly.length]!;
    const t = segLen[seg]! > 0 ? (target - acc) / segLen[seg]! : 0;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/** Map a normalized (0..1) polygon into a viewBox path, y-flipped so 0 is top. */
function toPath(poly: Pt[], w: number, h: number, pad = 6): string {
  if (poly.length === 0) return "";
  const iw = w - pad * 2;
  const ih = h - pad * 2;
  return poly
    .map((p, i) => `${i === 0 ? "M" : "L"}${(pad + p[0] * iw).toFixed(1)} ${(pad + p[1] * ih).toFixed(1)}`)
    .join(" ") + " Z";
}

/** Interpolate two outlines at t (0 = a, 1 = b) after arc-length resampling. */
export function morphPoly(a: Pt[], b: Pt[], t: number, n = 220): Pt[] {
  const ra = resample(a, n);
  const rb = resample(b, n);
  return ra.map((p, i) => [p[0] + (rb[i]![0] - p[0]) * t, p[1] + (rb[i]![1] - p[1]) * t] as Pt);
}

/** A single outline. `trace` draws the stroke in with a dash animation. */
export function Silhouette({ points, tone = "var(--color-cardio)", width = 150, height = 260, fill = true, trace = false, className }: {
  points: Pt[];
  tone?: string;
  width?: number;
  height?: number;
  fill?: boolean;
  trace?: boolean;
  className?: string;
}) {
  const d = useMemo(() => toPath(points, width, height), [points, width, height]);
  if (!d) return null;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={className} aria-hidden="true">
      {fill && <path d={d} fill={tone} fillOpacity={0.12} />}
      <path
        d={d}
        fill="none"
        stroke={tone}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        style={trace ? { strokeDasharray: 1200, strokeDashoffset: 1200, animation: "bodyscan-trace 1.6s cubic-bezier(0.22,1,0.36,1) forwards" } : undefined}
      />
      <style>{"@keyframes bodyscan-trace{to{stroke-dashoffset:0}}"}</style>
    </svg>
  );
}
