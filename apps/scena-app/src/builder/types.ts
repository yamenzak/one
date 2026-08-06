/**
 * The builder's editable widget node. Same information as the manifest scene-
 * graph node (§17), but with a flat x/y/w/h for ergonomic editing. Converted to
 * the manifest `Widget` shape (rect tuple) on publish. Type metadata + defaults
 * come from the shared `@scena/widgets` registry, so the palette, factory, and
 * player agree on what a widget is.
 */

import type { Widget } from "@scena/manifest";
import { WIDGET_REGISTRY, defaultsFor, type WidgetType, type ScaleMode, type DisplaySchedule } from "@scena/widgets";

export type WType = WidgetType;

// Drift guard: DisplaySchedule is defined in BOTH @scena/widgets (the runtime
// type + helpers) and @scena/manifest (the Zod wire schema); the packages can't
// depend on each other, so this asserts the two stay mutually assignable. If
// someone adds an `anim` value or field to one and not the other, this line
// stops compiling — a loud, intentional failure instead of silent drift.
type _Eq<A, B> = A extends B ? (B extends A ? true : never) : never;
const _displayScheduleInSync: _Eq<DisplaySchedule, NonNullable<Widget["display"]>> = true;
void _displayScheduleInSync;

export interface WNode {
  id: string;
  type: WType;
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  z: number;
  scaleMode?: ScaleMode;
  /** On-screen visibility cycle (§17): absent = always visible. */
  display?: DisplaySchedule;
  style: Record<string, unknown>;
  config: Record<string, unknown>;
}

export const DESIGN_W = 1920;
export const DESIGN_H = 1080;

const KNOWN_TYPES = new Set(WIDGET_REGISTRY.map((w) => w.type));

let counter = 0;
function nextId(type: string): string {
  counter += 1;
  return `${type}_${Date.now().toString(36)}${counter}`;
}

/** Create a new widget of a type, placed near the canvas centre with registry defaults. */
export function makeWidget(type: WType): WNode {
  const { size, style, config, scaleMode } = defaultsFor(type);
  const [w, h] = size;
  // Ticker defaults to a full-width footer; everything else lands centred-ish.
  const x = type === "ticker" ? 0 : Math.round((DESIGN_W - w) / 2);
  const y = type === "ticker" ? DESIGN_H - h : Math.round((DESIGN_H - h) / 2);
  return { id: nextId(type), type, x, y, w, h, rot: 0, z: 10, scaleMode, style, config };
}

export function fromManifestWidget(w: Widget): WNode {
  const [x, y, ww, hh] = w.rect;
  return {
    id: w.id,
    type: (KNOWN_TYPES.has(w.type as WidgetType) ? w.type : "box") as WType,
    x,
    y,
    w: ww,
    h: hh,
    rot: w.rot ?? 0,
    z: w.z ?? 0,
    scaleMode: w.scaleMode,
    display: w.display,
    style: (w.style as Record<string, unknown>) ?? {},
    config: (w.config as Record<string, unknown>) ?? {},
  };
}
