/**
 * Custom transform controller for the builder — drag / resize / rotate handles
 * driven by raw pointer coordinates, so the geometry is exact at any zoom and any
 * rotation (no black-box matrix surprises). All math is in DESIGN space; the box
 * is drawn in real pixels via `scale`.
 *
 * Resize keeps the opposite anchor fixed even when the widget is rotated, by
 * projecting the pointer delta onto the box's local (unrotated) axes and solving
 * for the new centre. Grid + guideline snapping happen here so what you drop is
 * what commits.
 */
import { useRef, type PointerEvent as RPointerEvent } from "react";
import type { WNode } from "./types.js";
import { snapToGrid, clampPos } from "./geometry.js";

export type Phase = "start" | "move" | "end";
type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
const HANDLES: { id: Handle; hx: -1 | 0 | 1; hy: -1 | 0 | 1; cursor: string }[] = [
  { id: "nw", hx: -1, hy: -1, cursor: "nwse-resize" },
  { id: "n", hx: 0, hy: -1, cursor: "ns-resize" },
  { id: "ne", hx: 1, hy: -1, cursor: "nesw-resize" },
  { id: "e", hx: 1, hy: 0, cursor: "ew-resize" },
  { id: "se", hx: 1, hy: 1, cursor: "nwse-resize" },
  { id: "s", hx: 0, hy: 1, cursor: "ns-resize" },
  { id: "sw", hx: -1, hy: 1, cursor: "nesw-resize" },
  { id: "w", hx: -1, hy: 0, cursor: "ew-resize" },
];

const MIN = 20;
const rot = (x: number, y: number, deg: number): [number, number] => {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [x * c - y * s, x * s + y * c];
};

export interface SnapCfg { grid: number; snap: boolean; guides: WNode[]; designW: number; designH: number }

export function TransformBox({
  node, scale, cfg, onChange, touch = false,
}: {
  node: WNode;
  scale: number;
  cfg: SnapCfg;
  onChange: (patch: Partial<WNode>, phase: Phase) => void;
  /** Larger hit targets for coarse (touch) pointers. */
  touch?: boolean;
}) {
  const base = useRef<WNode>(node);
  const start = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const mode = useRef<"drag" | "rotate" | Handle | null>(null);

  const begin = (e: RPointerEvent, m: "drag" | "rotate" | Handle) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    base.current = { ...node };
    start.current = { x: e.clientX, y: e.clientY };
    mode.current = m;
    onChange({}, "start");
  };

  const move = (e: RPointerEvent) => {
    if (!mode.current) return;
    const b = base.current;
    // pointer delta in design px
    const dx = (e.clientX - start.current.x) / scale;
    const dy = (e.clientY - start.current.y) / scale;

    if (mode.current === "drag") {
      let nx = b.x + dx, ny = b.y + dy;
      if (cfg.snap && !e.altKey) { nx = snapNear(nx, b.w, cfg, "x"); ny = snapNear(ny, b.h, cfg, "y"); }
      const c = clampPos(nx, ny, b.w, b.h, cfg.designW, cfg.designH); // keep it on-canvas
      onChange({ x: Math.round(c.x), y: Math.round(c.y) }, "move");
      return;
    }

    if (mode.current === "rotate") {
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      // Angle from the box centre to the current pointer (design space). The
      // handle sits above the top edge, so +90° aligns 0° with "up".
      const pxAbs = pointerDesignX(e, node, scale);
      const pyAbs = pointerDesignY(e, node, scale);
      let deg = (Math.atan2(pyAbs - cy, pxAbs - cx) * 180) / Math.PI + 90;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      onChange({ rot: Math.round(normalize(deg)) }, "move");
      return;
    }

    // resize — project delta onto the box's local axes
    const h = HANDLES.find((x) => x.id === mode.current)!;
    const [lx, ly] = rot(dx, dy, -b.rot); // delta in local (unrotated) space
    let nw = b.w + h.hx * lx;
    let nh = b.h + h.hy * ly;
    nw = Math.max(MIN, nw);
    nh = Math.max(MIN, nh);
    if (cfg.snap && !e.altKey) { if (h.hx) nw = Math.max(MIN, snapToGrid(nw, cfg.grid)); if (h.hy) nh = Math.max(MIN, snapToGrid(nh, cfg.grid)); }
    if (e.shiftKey && h.hx && h.hy) { const r = b.w / b.h; nh = nw / r; } // keep ratio on corners
    // Anchor = opposite handle, kept fixed in world space.
    const ax = -h.hx * 0.5, ay = -h.hy * 0.5;
    const cx0 = b.x + b.w / 2, cy0 = b.y + b.h / 2;
    const [awx, awy] = rot(ax * b.w, ay * b.h, b.rot);
    const anchorWorld = { x: cx0 + awx, y: cy0 + awy };
    const [nwx, nwy] = rot(ax * nw, ay * nh, b.rot);
    const nc = { x: anchorWorld.x - nwx, y: anchorWorld.y - nwy };
    const patch: Partial<WNode> = { w: Math.round(nw), h: Math.round(nh), x: Math.round(nc.x - nw / 2), y: Math.round(nc.y - nh / 2) };
    onChange(patch, "move");
  };

  const end = (e: RPointerEvent) => {
    if (!mode.current) return;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    mode.current = null;
    onChange({}, "end");
  };

  const L = node.x * scale, T = node.y * scale, Wp = node.w * scale, Hp = node.h * scale;
  const hb = touch ? 22 : 11; // handle box px — fatter targets on touch
  const rise = touch ? 40 : 26; // rotate-handle offset above the box

  return (
    <div
      style={{ position: "absolute", left: 0, top: 0, width: Wp, height: Hp, transform: `translate(${L}px, ${T}px)${node.rot ? ` rotate(${node.rot}deg)` : ""}`, transformOrigin: "center center", zIndex: 100000, pointerEvents: "none" }}
      onPointerMove={move}
      onPointerUp={end}
    >
      {/* selection outline + drag surface */}
      <div onPointerDown={(e) => begin(e, "drag")} style={{ position: "absolute", inset: 0, outline: "1.5px solid oklch(0.72 0.19 300)", cursor: "move", pointerEvents: "auto", touchAction: "none" }} />
      {/* rotate handle */}
      <div
        onPointerDown={(e) => begin(e, "rotate")}
        style={{ position: "absolute", left: "50%", top: -rise, width: hb, height: hb, marginLeft: -hb / 2, borderRadius: "50%", background: "oklch(0.72 0.19 300)", border: "2px solid white", cursor: "grab", pointerEvents: "auto", touchAction: "none", boxShadow: "0 1px 3px rgba(0,0,0,.4)" }}
      />
      <div style={{ position: "absolute", left: "50%", top: -rise + hb, height: rise - hb, width: 1, marginLeft: -0.5, background: "oklch(0.72 0.19 300)" }} />
      {/* resize handles */}
      {HANDLES.map((h) => {
        const cx = h.hx < 0 ? 0 : h.hx > 0 ? Wp : Wp / 2;
        const cy = h.hy < 0 ? 0 : h.hy > 0 ? Hp : Hp / 2;
        return (
          <div
            key={h.id}
            onPointerDown={(e) => begin(e, h.id)}
            style={{ position: "absolute", left: cx - hb / 2, top: cy - hb / 2, width: hb, height: hb, borderRadius: touch ? 5 : 3, background: "white", border: "1.5px solid oklch(0.72 0.19 300)", cursor: h.cursor, pointerEvents: "auto", touchAction: "none", boxShadow: "0 1px 2px rgba(0,0,0,.35)" }}
          />
        );
      })}
    </div>
  );
}

/** A drag-only bounding box for a multi-selection: moves every node together. */
export function GroupBox({ nodes, scale, cfg, onChange }: {
  nodes: WNode[]; scale: number; cfg: SnapCfg;
  onChange: (patches: Record<string, Partial<WNode>>, phase: Phase) => void;
}) {
  const start = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const bases = useRef<WNode[]>([]);
  const dragging = useRef(false);

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of nodes) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + n.w); y1 = Math.max(y1, n.y + n.h); }

  const begin = (e: RPointerEvent) => {
    e.stopPropagation(); e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY };
    bases.current = nodes.map((n) => ({ ...n }));
    dragging.current = true;
    onChange({}, "start");
  };
  const move = (e: RPointerEvent) => {
    if (!dragging.current) return;
    let dx = (e.clientX - start.current.x) / scale;
    let dy = (e.clientY - start.current.y) / scale;
    if (cfg.snap && !e.altKey) { dx = snapToGrid(dx, cfg.grid); dy = snapToGrid(dy, cfg.grid); }
    // Clamp the whole group by its bounding box so it can hug an edge but never
    // slide fully off-canvas (same rule as a single widget).
    const gw = x1 - x0, gh = y1 - y0;
    const c = clampPos(x0 + dx, y0 + dy, gw, gh, cfg.designW, cfg.designH);
    dx = c.x - x0; dy = c.y - y0;
    const map: Record<string, Partial<WNode>> = {};
    for (const b of bases.current) map[b.id] = { x: Math.round(b.x + dx), y: Math.round(b.y + dy) };
    onChange(map, "move");
  };
  const end = (e: RPointerEvent) => {
    if (!dragging.current) return;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    dragging.current = false;
    onChange({}, "end");
  };

  return (
    <div
      style={{ position: "absolute", left: x0 * scale, top: y0 * scale, width: (x1 - x0) * scale, height: (y1 - y0) * scale, zIndex: 100000, pointerEvents: "none" }}
      onPointerMove={move} onPointerUp={end}
    >
      <div onPointerDown={begin} style={{ position: "absolute", inset: 0, outline: "1.5px dashed oklch(0.72 0.19 300)", background: "oklch(0.72 0.19 300 / 0.06)", cursor: "move", pointerEvents: "auto", touchAction: "none" }} />
    </div>
  );
}

/* Convert a pointer event to absolute DESIGN coordinates via the stage the box
 * lives in. We reconstruct from the box's own on-screen rect (stable + local). */
function pointerDesignX(e: RPointerEvent, node: WNode, scale: number): number {
  const stage = (e.currentTarget as HTMLElement).offsetParent as HTMLElement | null;
  const r = stage?.getBoundingClientRect();
  return r ? (e.clientX - r.left) / scale : node.x;
}
function pointerDesignY(e: RPointerEvent, node: WNode, scale: number): number {
  const stage = (e.currentTarget as HTMLElement).offsetParent as HTMLElement | null;
  const r = stage?.getBoundingClientRect();
  return r ? (e.clientY - r.top) / scale : node.y;
}

function normalize(d: number): number { let x = d % 360; if (x < -180) x += 360; if (x > 180) x -= 360; return x; }

/** Snap an edge/center of the box to the grid + canvas centre/edges. */
function snapNear(v: number, size: number, cfg: SnapCfg, axis: "x" | "y"): number {
  const g = snapToGrid(v, cfg.grid);
  // Snap the box centre to the canvas centre when close (within ~1 grid).
  const canvas = axis === "x" ? cfg.designW : cfg.designH;
  const center = canvas / 2 - size / 2;
  if (Math.abs(v - center) < cfg.grid) return center;
  return g;
}
