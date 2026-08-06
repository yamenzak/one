/**
 * The widget registry — the single list of what a widget *is*: its palette
 * grouping, icon id, default footprint, and default style/config. The builder's
 * palette and node factory both read from here, so adding a widget is one entry,
 * not edits scattered across factory + palette + preview.
 */

import type { WidgetType, Style, Config, ScaleMode } from "./types.js";

export type WidgetGroup = "Text & time" | "Content" | "Data & feeds" | "Shapes" | "Media";

export interface WidgetDef {
  type: WidgetType;
  label: string;
  group: WidgetGroup;
  /** Icon id resolved to an SVG in the dashboard's widget-icon set. */
  icon: string;
  /** Default [w, h] footprint in design space. */
  size: [number, number];
  style: Style;
  config: Config;
  /** Widgets that bind to external data can't be dropped "blank" meaningfully. */
  needsBinding?: "feed" | "board" | "weather";
  /** Default resize behaviour for a freshly-dropped widget (§17). */
  scaleMode: ScaleMode;
  /**
   * Intrinsic content size for "uniform" scaling. Content is authored to fill
   * this box, then scaled to the node's actual rect. Defaults to `size`.
   */
  intrinsic?: [number, number];
}

export const WIDGET_REGISTRY: WidgetDef[] = [
  {
    type: "text",
    scaleMode: "uniform",
    label: "Text",
    group: "Text & time",
    icon: "text",
    size: [520, 160],
    style: { color: "var(--w-fg, #ffffff)", fontSize: 72, fontWeight: "800", font: "sans", align: "left" },
    config: { text: "Your text", variant: "plain" },
  },
  {
    type: "clock",
    scaleMode: "uniform",
    label: "Clock",
    group: "Text & time",
    icon: "clock",
    size: [460, 150],
    style: { color: "var(--w-fg, #ffffff)", fontSize: 96, font: "mono", fontWeight: "700", letterSpacing: 2, bg: "transparent", accent: "var(--w-accent, oklch(0.7 0.2 25))" },
    config: { variant: "digital", hour12: false, seconds: true, showDate: false, dateVariant: "medium" },
  },
  {
    type: "date",
    scaleMode: "uniform",
    label: "Date",
    group: "Text & time",
    icon: "date",
    size: [640, 110],
    style: { color: "var(--w-fg, #ffffff)", fontSize: 54, fontWeight: "600", font: "sans", bg: "transparent" },
    config: { variant: "full" },
  },
  {
    type: "ticker",
    scaleMode: "reflow",
    label: "Ticker",
    group: "Data & feeds",
    icon: "ticker",
    size: [1920, 100],
    style: { bg: "var(--w-surface, oklch(0.15 0.01 300 / 0.78))", color: "var(--w-fg, #ffffff)", fontSize: 44, fontWeight: "600", speed: 90, direction: "left", gap: 0 },
    config: { feedId: "", variant: "scroll", separatorKind: "custom", separator: "  •  ", badge: "", badgeColor: "var(--w-accent, oklch(0.55 0.22 25))" },
    needsBinding: "feed",
  },
  {
    type: "countdown",
    scaleMode: "uniform",
    label: "Countdown",
    group: "Content",
    icon: "countdown",
    size: [720, 220],
    intrinsic: [720, 220],
    style: { color: "var(--w-fg, #ffffff)", fontSize: 96, fontWeight: "800", font: "sans", accent: "var(--w-surface, oklch(0.22 0.03 300 / 0.6))" },
    config: { variant: "blocks", target: "2026-12-31T23:59", showDays: true, countUp: false, doneText: "We're live!" },
  },
  {
    type: "metric",
    scaleMode: "uniform",
    label: "Metric",
    group: "Content",
    icon: "metric",
    size: [460, 300],
    intrinsic: [460, 300],
    style: { bg: "var(--w-surface, oklch(0.18 0.02 300 / 0.55))", color: "var(--w-fg, #ffffff)", accent: "var(--w-accent, oklch(0.72 0.19 300))", radius: 22, fontSize: 104, fontWeight: "800" },
    config: { variant: "card", label: "Visitors today", value: "1,284", unit: "", caption: "vs. 1,190 yesterday", trend: "up", delta: "+7.9%", percent: 66 },
  },
  {
    type: "menu",
    scaleMode: "reflow",
    label: "Menu / list",
    group: "Content",
    icon: "menu",
    size: [560, 620],
    style: { bg: "var(--w-surface, oklch(0.16 0.02 300 / 0.62))", color: "var(--w-fg, #ffffff)", accent: "var(--w-accent, oklch(0.78 0.14 85))", radius: 22, fontWeight: "700" },
    config: {
      variant: "rows", title: "Today's menu",
      items: [
        { label: "Espresso", note: "double shot", value: "$3.20" },
        { label: "Flat white", value: "$4.50" },
        { label: "Cold brew", note: "16oz", value: "$5.00" },
        { label: "Croissant", note: "butter", value: "$3.80" },
      ],
    },
  },
  {
    type: "qr",
    scaleMode: "uniform",
    label: "QR code",
    group: "Media",
    icon: "qr",
    // Square by default — a QR is square. Bare by default: just the code, no
    // card (transparent container, no padding). The user can add a card via the
    // Surface control if they want one.
    size: [320, 320],
    intrinsic: [320, 320],
    style: { color: "#0b0b0f", paper: "#ffffff", bg: "transparent", pad: 0 },
    config: { text: "https://scena.app", caption: "" },
  },
  {
    // Scan-to-act card — an animated, on-brand QR call-to-action (rate us,
    // feedback, follow, wifi, menu, tip). Authored portrait; scales as a unit.
    type: "cta",
    scaleMode: "uniform",
    label: "Scan / CTA",
    group: "Media",
    icon: "cta",
    size: [560, 760],
    intrinsic: [560, 760],
    style: { color: "var(--w-fg, #ffffff)", accent: "var(--w-accent, oklch(0.72 0.19 300))", bg: "var(--w-surface, oklch(0.17 0.02 300 / 0.82))", radius: 32, qrDark: "#0b0b0f", qrLight: "#ffffff", animate: true },
    config: { preset: "google", url: "https://g.page/r/your-business/review", headline: "", sub: "", hint: "" },
  },
  {
    // Sandboxed HTML — hand-written or AI-generated markup, rendered in an
    // isolated iframe scoped to the widget box (like an HTML slide, in a box).
    type: "html",
    scaleMode: "reflow",
    label: "HTML embed",
    group: "Content",
    icon: "html",
    size: [720, 480],
    style: { radius: 16 },
    config: { html: "" },
  },
  {
    type: "weather",
    scaleMode: "reflow",
    label: "Weather",
    group: "Data & feeds",
    icon: "weather",
    size: [640, 320],
    style: { bg: "var(--w-surface, oklch(0.2 0.03 250 / 0.55))", radius: 20, color: "var(--w-fg, #ffffff)" },
    config: { sourceId: "", variant: "current" },
    needsBinding: "weather",
  },
  {
    type: "stack",
    scaleMode: "reflow",
    label: "Stack loop",
    group: "Data & feeds",
    icon: "stack",
    size: [640, 360],
    style: { bg: "var(--w-surface, oklch(0.2 0.02 300 / 0.5))", radius: 18, color: "var(--w-fg, #ffffff)", fontSize: 64, fontWeight: "800" },
    config: {
      dwellMs: 5000,
      transition: "fade",
      shuffle: false,
      items: [
        { id: "s0", widget: { type: "text", style: { color: "var(--w-fg, #ffffff)", fontSize: 88, fontWeight: "800", align: "center" }, config: { text: "Slide one" } } },
        { id: "s1", widget: { type: "text", style: { color: "var(--w-fg, #ffffff)", fontSize: 88, fontWeight: "800", align: "center" }, config: { text: "Slide two" } } },
      ],
    },
  },
  {
    type: "nowplaying",
    scaleMode: "reflow",
    label: "Now Playing",
    group: "Data & feeds",
    icon: "nowplaying",
    size: [560, 160],
    style: { bg: "var(--w-surface, oklch(0.16 0.02 300 / 0.72))", radius: 18, color: "var(--w-fg, #ffffff)", accent: "var(--w-accent, oklch(0.72 0.19 300))" },
    config: { variant: "card" },
  },
  {
    type: "queue_caller",
    scaleMode: "reflow",
    label: "Queue",
    group: "Data & feeds",
    icon: "queue",
    size: [800, 400],
    style: { bg: "var(--w-surface, oklch(0.18 0.02 300 / 0.72))", radius: 22 },
    config: { boardId: "", variant: "solo" },
    needsBinding: "board",
  },
  {
    type: "room_board",
    scaleMode: "reflow",
    label: "Rooms",
    group: "Data & feeds",
    icon: "rooms",
    size: [1600, 680],
    style: { bg: "var(--w-surface, oklch(0.18 0.02 300 / 0.55))", radius: 22 },
    config: { boardId: "" },
    needsBinding: "board",
  },
  {
    type: "room_status",
    scaleMode: "reflow",
    label: "Room status",
    group: "Data & feeds",
    icon: "door",
    // Portrait by default — a door tablet fills the panel with the room's colour.
    size: [560, 900],
    style: { radius: 0 },
    config: { boardId: "", roomId: "" },
    needsBinding: "board",
  },
  {
    type: "scoreboard",
    scaleMode: "reflow",
    label: "Scoreboard",
    group: "Data & feeds",
    icon: "score",
    size: [900, 420],
    style: { bg: "var(--w-surface, oklch(0.16 0.02 300 / 0.82))", radius: 22 },
    config: { boardId: "", variant: "classic" },
    needsBinding: "board",
  },
  {
    type: "box",
    scaleMode: "reflow",
    label: "Rectangle",
    group: "Shapes",
    icon: "rect",
    size: [360, 240],
    style: { fill: "var(--w-accent, oklch(0.58 0.17 300))", radius: 24, opacity: 1, shadow: "none" },
    config: {},
  },
  {
    type: "circle",
    scaleMode: "uniform",
    label: "Circle",
    group: "Shapes",
    icon: "circle",
    size: [280, 280],
    style: { fill: "var(--w-accent-2, oklch(0.62 0.19 200))", opacity: 1, shadow: "none" },
    config: {},
  },
  {
    type: "triangle",
    scaleMode: "uniform",
    label: "Triangle",
    group: "Shapes",
    icon: "triangle",
    size: [300, 260],
    style: { fill: "var(--w-accent, oklch(0.68 0.18 90))", opacity: 1, shadow: "none" },
    config: {},
  },
  {
    type: "line",
    scaleMode: "reflow",
    label: "Line",
    group: "Shapes",
    icon: "line",
    size: [520, 40],
    style: { fill: "var(--w-fg, #ffffff)", thickness: 6, radius: 6, opacity: 1 },
    config: {},
  },
  {
    type: "image",
    scaleMode: "reflow",
    label: "Image",
    group: "Media",
    icon: "image",
    size: [520, 340],
    style: { radius: 12, opacity: 1 },
    config: { url: "", fit: "cover" },
  },
  {
    type: "logo",
    scaleMode: "reflow",
    label: "Company logo",
    group: "Media",
    icon: "logo",
    size: [340, 140],
    // Logos sit on whatever's behind them — no surface, contained (never cropped).
    style: { radius: 0, opacity: 1 },
    config: { url: "", logoId: "", variant: "", fit: "contain" },
  },
];

export function widgetDef(type: string): WidgetDef | undefined {
  return WIDGET_REGISTRY.find((w) => w.type === type);
}

export const WIDGET_GROUPS: WidgetGroup[] = ["Text & time", "Content", "Data & feeds", "Shapes", "Media"];

/** Deep-clone the registry defaults for a fresh node (so edits never alias). */
export function defaultsFor(type: string): { size: [number, number]; style: Style; config: Config; scaleMode: ScaleMode } {
  const def = widgetDef(type) ?? WIDGET_REGISTRY[0]!;
  return {
    size: [...def.size] as [number, number],
    style: structuredClone(def.style),
    config: structuredClone(def.config),
    scaleMode: def.scaleMode,
  };
}

/** A node's effective scale mode. Legacy nodes (no stored mode) render as they
 *  always have — "reflow" (content fills the box) — so existing profiles are
 *  visually unchanged; new widgets carry the registry's chosen default. */
export function resolveScaleMode(_type: string, stored?: string | null): ScaleMode {
  return stored === "uniform" || stored === "reflow" ? stored : "reflow";
}

/** Intrinsic content box for uniform scaling (defaults to the footprint). */
export function intrinsicSize(type: string): [number, number] {
  const def = widgetDef(type);
  return (def?.intrinsic ?? def?.size ?? [200, 120]) as [number, number];
}
