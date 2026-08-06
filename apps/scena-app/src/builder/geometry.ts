/**
 * Pure geometry helpers for the builder canvas — grid snapping, marquee
 * hit-testing, and align/distribute. All in design-space coordinates; no DOM.
 */
import type { WNode } from "./types.js";

export interface Rect { x: number; y: number; w: number; h: number }

export const snapToGrid = (v: number, grid: number): number => (grid > 0 ? Math.round(v / grid) * grid : v);

/** How much of a widget must stay on-canvas per axis — enough to grab it back.
 *  A widget smaller than this can't hang off at all (it clamps fully inside). */
const KEEP = 48;

/** Clamp a widget's top-left so it can sit flush to (or hang partway over) any
 *  edge, but never slide *fully* off the canvas and get lost. A full-bleed widget
 *  (as wide/tall as the canvas) still reaches every edge. */
export function clampPos(x: number, y: number, w: number, h: number, designW: number, designH: number): { x: number; y: number } {
  const keepX = Math.min(w, KEEP), keepY = Math.min(h, KEEP);
  return {
    x: Math.max(keepX - w, Math.min(x, designW - keepX)),
    y: Math.max(keepY - h, Math.min(y, designH - keepY)),
  };
}

/** Axis-aligned overlap test (marquee rect vs node rect), design space. */
export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** The bounding box of a set of nodes. */
export function bounds(nodes: WNode[]): Rect | null {
  if (!nodes.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of nodes) {
    x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y);
    x1 = Math.max(x1, n.x + n.w); y1 = Math.max(y1, n.y + n.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export type AlignKind = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

/** Align a set of nodes to their common bounding box. Returns {id: patch}. */
export function alignPatches(nodes: WNode[], kind: AlignKind): Record<string, Partial<WNode>> {
  const b = bounds(nodes);
  const out: Record<string, Partial<WNode>> = {};
  if (!b) return out;
  for (const n of nodes) {
    if (kind === "left") out[n.id] = { x: b.x };
    else if (kind === "right") out[n.id] = { x: b.x + b.w - n.w };
    else if (kind === "hcenter") out[n.id] = { x: b.x + (b.w - n.w) / 2 };
    else if (kind === "top") out[n.id] = { y: b.y };
    else if (kind === "bottom") out[n.id] = { y: b.y + b.h - n.h };
    else if (kind === "vcenter") out[n.id] = { y: b.y + (b.h - n.h) / 2 };
  }
  return out;
}

/** Evenly distribute gaps between 3+ nodes along an axis. Returns {id: patch}. */
export function distributePatches(nodes: WNode[], axis: "h" | "v"): Record<string, Partial<WNode>> {
  const out: Record<string, Partial<WNode>> = {};
  if (nodes.length < 3) return out;
  const key = axis === "h" ? "x" : "y";
  const size = axis === "h" ? "w" : "h";
  const sorted = [...nodes].sort((a, b) => a[key] - b[key]);
  const first = sorted[0]!, last = sorted[sorted.length - 1]!;
  const span = (last[key] + last[size]) - first[key];
  const totalW = sorted.reduce((s, n) => s + n[size], 0);
  const gap = (span - totalW) / (sorted.length - 1);
  let cursor = first[key];
  for (const n of sorted) {
    out[n.id] = { [key]: Math.round(cursor) } as Partial<WNode>;
    cursor += n[size] + gap;
  }
  return out;
}
