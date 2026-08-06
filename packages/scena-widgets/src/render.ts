/**
 * The visual math shared by both renderers. Every function is pure: it takes a
 * widget's `style`/`config` (plus size where layout needs it) and returns a
 * `Css` dict or a display string. No DOM, no React — just the look, computed
 * once and drawn the same in the builder preview and on the screen.
 */

import { type Css, type Style, type Config, type WidgetType, str, num, bool } from "./types.js";

/* ------------------------------- scaling --------------------------------- */

/**
 * Uniform-scale fit factor: how much to scale an intrinsic `iw × ih` content
 * box so it fills a `w × h` frame without cropping (the smaller of the two
 * ratios — like `object-fit: contain`). Shared by the player + builder so a
 * "uniform" widget scales byte-identically in both.
 */
export function scalerFit(iw: number, ih: number, w: number, h: number): number {
  if (!(iw > 0) || !(ih > 0) || !(w > 0) || !(h > 0)) return 1;
  return Math.min(w / iw, h / ih);
}

/** The effective height a widget's body should size its content from, after the
 *  user's "Content size" multiplier (style.contentScale, 100% = default). Body
 *  renderers derive fonts/spacing from `h`, so scaling `h` scales the inner
 *  content within the same box — a size knob independent of resizing the box.
 *  Clamped to a sane range so content can't collapse or blow out. */
export function contentH(style: Style, h: number): number {
  const s = Math.min(2, Math.max(0.4, num(style.contentScale, 1)));
  return Math.round(h * s);
}

/** Frame-level backdrop blur (frosted glass over the content behind the widget).
 *  Returns a CSS `blur(Npx)` string, or undefined when off. */
export function blurValue(style: Style): string | undefined {
  // Cap the radius: backdrop-filter cost climbs steeply with blur radius, and
  // over a playing video it re-blurs every frame — a big radius on a weak screen
  // GPU is a frame-rate cliff. 24px reads as full frosted glass; more just burns.
  const b = Math.min(24, num(style.blur, 0));
  return b > 0 ? `blur(${b}px)` : undefined;
}

/* --------------------------- border & radius ----------------------------- */

/** Per-corner border-radius. `radius` sets all four; `radiusTL/TR/BR/BL` override
 *  a single corner — so a card can round only its top, a badge only one side, … */
export function radiusValue(style: Style, fallback = 0): string {
  const all = num(style.radius, fallback);
  const tl = num(style.radiusTL, all), tr = num(style.radiusTR, all);
  const br = num(style.radiusBR, all), bl = num(style.radiusBL, all);
  return `${tl}px ${tr}px ${br}px ${bl}px`;
}

/** True when any radius value is present (so containers only emit it when set). */
export function hasRadius(style: Style): boolean {
  return style.radius != null || style.radiusTL != null || style.radiusTR != null || style.radiusBR != null || style.radiusBL != null;
}

/** Per-side border. `borderStyle` (solid/dashed/dotted/double) + `borderColor`;
 *  `borderW` sets all sides, `borderWT/R/B/L` override one. Legacy `strokeWidth`/
 *  `stroke` still map to a uniform border. Returns per-side border CSS, or {}. */
export function borderCss(style: Style): Css {
  const bs = str(style.borderStyle, "solid");
  if (bs === "none") return {};
  const color = str(style.borderColor ?? style.stroke, "var(--w-border, #ffffff)");
  const all = num(style.borderW ?? style.strokeWidth, 0);
  const t = num(style.borderWT, all), r = num(style.borderWR, all), b = num(style.borderWB, all), l = num(style.borderWL, all);
  const css: Css = {};
  if (t > 0) css.borderTop = `${t}px ${bs} ${color}`;
  if (r > 0) css.borderRight = `${r}px ${bs} ${color}`;
  if (b > 0) css.borderBottom = `${b}px ${bs} ${color}`;
  if (l > 0) css.borderLeft = `${l}px ${bs} ${color}`;
  return css;
}

/* -------------------------------- fills ---------------------------------- */

/** A solid colour or a linear gradient, whichever the style declares. */
export function fillValue(style: Style): string | undefined {
  const g = style.gradient as { from?: string; to?: string; angle?: number } | undefined;
  if (g && (g.from || g.to)) {
    const from = str(g.from, "var(--w-accent, oklch(0.6 0.18 300))");
    const to = str(g.to, "var(--w-accent-2, oklch(0.5 0.2 260))");
    return `linear-gradient(${num(g.angle, 135)}deg, ${from}, ${to})`;
  }
  const solid = style.fill ?? style.bg;
  return solid != null ? str(solid) : undefined;
}

/** Named box-shadow presets, so "premium depth" is one dropdown, not a string. */
export const SHADOW_PRESETS: { id: string; label: string; css: string }[] = [
  { id: "none", label: "None", css: "none" },
  { id: "sm", label: "Subtle", css: "0 2px 8px oklch(0.2 0.03 300 / 0.25)" },
  { id: "md", label: "Medium", css: "0 8px 24px oklch(0.2 0.04 300 / 0.32)" },
  { id: "lg", label: "Deep", css: "0 18px 50px oklch(0.15 0.05 300 / 0.45)" },
  { id: "glow", label: "Glow", css: "0 0 28px oklch(0.7 0.2 300 / 0.55)" },
];

export function shadowValue(style: Style): string | undefined {
  const s = style.shadow;
  if (s == null || s === false) return undefined;
  const preset = SHADOW_PRESETS.find((p) => p.id === s);
  if (preset) return preset.css === "none" ? undefined : preset.css;
  return str(s) || undefined; // a raw css shadow string is allowed too
}

/* -------------------------------- shapes --------------------------------- */

const TRIANGLE_CLIP = "polygon(50% 0%, 0% 100%, 100% 100%)";

/** Container CSS for a filled shape (box / circle / triangle). */
export function shapeCss(type: WidgetType, style: Style): Css {
  const css: Css = { width: "100%", height: "100%", boxSizing: "border-box" };
  const fill = fillValue(style) ?? "var(--w-accent, oklch(0.58 0.17 300))";
  css.background = fill;
  css.opacity = num(style.opacity, 1);
  const shadow = shadowValue(style);
  if (shadow) css.boxShadow = shadow;

  if (type === "circle") {
    css.borderRadius = "50%";
  } else if (type === "triangle") {
    css.clipPath = TRIANGLE_CLIP;
  } else {
    css.borderRadius = radiusValue(style, 0);
  }
  // A stroke reads as a per-side border (skipped for triangle — clip-path eats it).
  if (type !== "triangle") Object.assign(css, borderCss(style));
  return css;
}

export const LINE_STYLES: { id: string; label: string }[] = [
  { id: "solid", label: "Solid" },
  { id: "dashed", label: "Dashed" },
  { id: "dotted", label: "Dotted" },
  { id: "gradient", label: "Gradient" },
];

/** The inner bar of a line widget (the outer frame is a transparent flex box).
 *  Solid/gradient render as a filled bar; dashed/dotted as a top border so the
 *  dash rhythm scales with thickness. */
export function lineCss(style: Style): Css {
  const thickness = Math.max(1, num(style.thickness, 4));
  const kind = str(style.lineStyle, "solid");
  const color = fillValue(style) ?? str(style.color, "var(--w-fg, #ffffff)");
  const css: Css = { width: "100%", height: `${thickness}px`, opacity: num(style.opacity, 1) };
  if (kind === "dashed" || kind === "dotted") {
    css.height = "0px";
    css.borderTop = `${thickness}px ${kind} ${str(style.color ?? style.fill, "var(--w-fg, #ffffff)")}`;
  } else {
    css.background = color;
    css.borderRadius = str(style.lineCap, "round") === "round" ? `${num(style.radius, thickness)}px` : "0px";
  }
  const shadow = shadowValue(style);
  if (shadow) css.boxShadow = shadow;
  return css;
}

/* -------------------------------- image ---------------------------------- */

/** CSS `filter` string from grayscale/brightness/contrast/saturate/blur, or none. */
export function imageFilterCss(style: Style): string | undefined {
  const parts: string[] = [];
  const g = num(style.grayscale, 0); if (g > 0) parts.push(`grayscale(${Math.min(100, g)}%)`);
  const br = num(style.brightness, 100); if (br !== 100) parts.push(`brightness(${br}%)`);
  const ct = num(style.contrast, 100); if (ct !== 100) parts.push(`contrast(${ct}%)`);
  const sa = num(style.saturate, 100); if (sa !== 100) parts.push(`saturate(${sa}%)`);
  const bl = num(style.imgBlur, 0); if (bl > 0) parts.push(`blur(${bl}px)`);
  return parts.length ? parts.join(" ") : undefined;
}

/** Full CSS for an image widget — `fit`, per-side radius/border, opacity, a colour
 *  tint overlay, and photo filters — shared by the player + builder. */
export function imageCss(style: Style, config: Config, url: string | undefined): Css {
  const fit = str(config.fit, "cover");
  const size = fit === "fill" ? "100% 100%" : fit;
  const css: Css = {
    width: "100%", height: "100%", boxSizing: "border-box",
    borderRadius: radiusValue(style, 0),
    opacity: num(style.opacity, 1),
    overflow: "hidden",
  };
  if (url) {
    const tint = str(style.tint);
    const layers = tint ? [`linear-gradient(${tint},${tint})`, `center/${size} no-repeat url("${url}")`] : [`center/${size} no-repeat url("${url}")`];
    css.background = layers.join(", ");
  } else {
    css.background = "var(--w-surface, oklch(0.32 0.02 300))";
  }
  Object.assign(css, borderCss(style));
  const filter = imageFilterCss(style);
  if (filter) css.filter = filter;
  const shadow = shadowValue(style);
  if (shadow) css.boxShadow = shadow;
  return css;
}

/* --------------------------------- text ---------------------------------- */

/** A small curated set of families so the picker stays a dropdown, not a text box. */
export const FONT_OPTIONS: { id: string; label: string; css: string }[] = [
  { id: "sans", label: "Sans (Hanken Grotesk)", css: "var(--w-font, 'Hanken Grotesk', system-ui, sans-serif)" },
  { id: "mono", label: "Mono (JetBrains Mono)", css: "var(--w-font-mono, 'JetBrains Mono', ui-monospace, monospace)" },
  { id: "serif", label: "Serif (Georgia)", css: "Georgia, 'Times New Roman', serif" },
  { id: "system", label: "System UI", css: "system-ui, -apple-system, sans-serif" },
];

export function fontFamilyValue(style: Style, fallbackId = "sans"): string {
  const id = str(style.font, fallbackId);
  const known = FONT_OPTIONS.find((f) => f.id === id);
  if (known) return known.css;
  if (id.includes(",")) return id; // already a full family stack
  // A bundled/self-hosted family name (e.g. "Poppins", "Playfair Display") —
  // quote it and keep a sane fallback so an unloaded font still reads.
  if (id) return `'${id.replace(/'/g, "")}', system-ui, sans-serif`;
  return FONT_OPTIONS[0]!.css;
}

/** Visual variants for the text widget (container-level, so no wrapper needed). */
export const TEXT_VARIANTS = [
  { id: "plain", label: "Plain" },
  { id: "panel", label: "Panel" },
  { id: "highlight", label: "Highlight" },
  { id: "quote", label: "Quote" },
  { id: "underline", label: "Underline" },
];

/** Text/clock/date CSS. `h` seeds a size default proportional to the box. */
export function textCss(type: WidgetType, style: Style, config: Config, h: number): Css {
  const align = str(config.align ?? style.align, type === "clock" || type === "date" ? "center" : "left");
  const css: Css = {
    width: "100%",
    height: "100%",
    display: "flex",
    boxSizing: "border-box",
    alignItems: str(style.valign, "center") === "top" ? "flex-start" : str(style.valign) === "bottom" ? "flex-end" : "center",
    justifyContent: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start",
    textAlign: align,
    color: str(style.color, "var(--w-fg, #ffffff)"),
    fontFamily: fontFamilyValue(style, type === "clock" ? "mono" : "sans"),
    fontSize: `${num(style.fontSize ?? config.fontSize, Math.round(h * (type === "clock" ? 0.62 : 0.5)))}px`,
    fontWeight: str(style.fontWeight ?? config.fontWeight, type === "clock" ? "700" : "600"),
    lineHeight: num(style.lineHeight, 1.1),
    letterSpacing: `${num(style.letterSpacing, 0)}px`,
    whiteSpace: "pre-wrap",
    opacity: num(style.opacity, 1),
  };
  if (style.textTransform) css.textTransform = str(style.textTransform);
  // Text fill: a solid/gradient background, optionally clipped to the glyphs so
  // the *text itself* carries a gradient (premium hero type).
  const fill = fillValue(style);
  // A "transparent"/"none" fill means no card at all (no background, no pad) —
  // so text/clock/date default to bare and a Surface "None" truly clears it.
  const bgFill = fill && fill !== "transparent" && fill !== "none" ? fill : undefined;
  const gradientText = bool(style.gradientText) && !!fill;
  if (bgFill && !gradientText) css.background = bgFill;
  if (gradientText && fill) {
    css.background = fill;
    css.backgroundClip = "text";
    (css as Record<string, string>).WebkitBackgroundClip = "text";
    css.color = "transparent";
    (css as Record<string, string>).WebkitTextFillColor = "transparent";
  }
  // Text outline / stroke (via paint-order + webkit stroke) for punchy titles.
  const strokeW = num(style.textStrokeW, 0);
  if (strokeW > 0) {
    (css as Record<string, string>).WebkitTextStrokeWidth = `${strokeW}px`;
    (css as Record<string, string>).WebkitTextStrokeColor = str(style.textStrokeColor, "#000000");
    css.paintOrder = "stroke fill";
  }
  if (hasRadius(style)) css.borderRadius = radiusValue(style);
  Object.assign(css, borderCss(style));
  let pad = num(style.padding, bgFill || hasRadius(style) ? 16 : 0);
  // Text visual variants — layered on top, but never clobbering an explicit
  // fill/radius/border the user set. Sizes scale with the box (design px).
  if (type === "text") {
    const v = str(config.variant, "plain");
    const wAccent = "var(--w-accent, oklch(0.66 0.19 300))";
    if (v === "panel" || v === "highlight") {
      if (!fill) css.background = v === "highlight" ? wAccent : "var(--w-surface, oklch(0.18 0.02 300 / 0.62))";
      if (!hasRadius(style)) css.borderRadius = "var(--w-radius, 18px)";
      pad = Math.max(pad, Math.round(h * 0.16));
    } else if (v === "quote") {
      if (num(style.borderW ?? style.strokeWidth, 0) === 0) css.borderLeft = `${Math.max(4, Math.round(h * 0.06))}px solid ${wAccent}`;
      css.fontStyle = "italic";
      pad = Math.max(pad, Math.round(h * 0.14));
    } else if (v === "underline") {
      if (num(style.borderW ?? style.strokeWidth, 0) === 0) css.borderBottom = `${Math.max(3, Math.round(h * 0.05))}px solid ${wAccent}`;
      pad = Math.max(pad, Math.round(h * 0.08));
    }
  }
  if (pad) css.padding = `${pad}px`;
  const shadow = shadowValue(style);
  if (shadow) css.boxShadow = shadow;
  if (style.textShadow) css.textShadow = str(style.textShadow);
  return css;
}

/* ----------------------------- clock / date ------------------------------ */

const pad = (n: number): string => String(n).padStart(2, "0");

export function clockFormat(config: Config): string {
  const hour = bool(config.hour12) ? "hh" : "HH";
  let f = `${hour}:mm`;
  if (bool(config.seconds, true)) f += ":ss";
  if (bool(config.hour12)) f += " A";
  return f;
}

export function formatClock(d: Date, format: string): string {
  const h24 = d.getHours();
  const h12 = h24 % 12 || 12;
  return format
    .replace("HH", pad(h24))
    .replace("hh", pad(h12))
    .replace("mm", pad(d.getMinutes()))
    .replace("ss", pad(d.getSeconds()))
    .replace("A", h24 < 12 ? "AM" : "PM");
}

/** Clock display families (§17). Digital keeps the numeric readout; analog draws
 *  a face + hands. Both honour 12/24h, seconds, and the optional date line. */
export const CLOCK_VARIANTS: { id: string; label: string }[] = [
  { id: "digital", label: "Digital" },
  { id: "analog", label: "Analog" },
];

export function clockIsAnalog(config: Config): boolean {
  return str(config.variant, "digital") === "analog";
}

/** Re-express an instant as a Date whose *local* fields read the wall-clock time
 *  in the given IANA zone (e.g. "America/New_York") — so a clock can show any
 *  city's time regardless of where the screen physically runs. Invalid/empty
 *  zones fall through to the screen's local time. */
export function zonedDate(d: Date, tz: string): Date {
  if (!tz) return d;
  try {
    const wall = new Date(d.toLocaleString("en-US", { timeZone: tz }));
    return Number.isNaN(wall.getTime()) ? d : wall;
  } catch {
    return d;
  }
}

/** Hand angles (degrees, 0 = 12 o'clock, clockwise) for an analog face. */
export function clockHands(d: Date): { hour: number; minute: number; second: number } {
  const s = d.getSeconds();
  const m = d.getMinutes() + s / 60;
  const h = (d.getHours() % 12) + m / 60;
  return { hour: h * 30, minute: m * 6, second: s * 6 };
}

/**
 * An analog clock face as a self-contained SVG string (viewBox 0..100), so it
 * scales to any box and renders byte-identically in the builder (innerHTML) and
 * the player (innerHTML). Face = style.bg, hands/ticks = style.color, second
 * hand = style.accent; the seconds config toggles the second hand. */
export function analogClockSvg(d: Date, style: Style, config: Config): string {
  const { hour, minute, second } = clockHands(d);
  const face = str(style.bg, "var(--w-surface, oklch(0.2 0.02 300 / 0.35))");
  const ink = str(style.color, "var(--w-fg, #ffffff)");
  const accent = str(style.accent, "var(--w-accent, oklch(0.7 0.2 25))");
  const showSec = bool(config.seconds, true);
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const long = i % 3 === 0;
    return `<line x1="50" y1="4" x2="50" y2="${long ? 11 : 8}" stroke="${ink}" stroke-opacity="${long ? 0.9 : 0.4}" stroke-width="${long ? 2 : 1}" transform="rotate(${i * 30} 50 50)"/>`;
  }).join("");
  const hand = (deg: number, len: number, w: number, color: string) =>
    `<line x1="50" y1="54" x2="50" y2="${50 - len}" stroke="${color}" stroke-width="${w}" stroke-linecap="round" transform="rotate(${deg} 50 50)"/>`;
  return `<svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">`
    + `<circle cx="50" cy="50" r="48" fill="${face}" stroke="${ink}" stroke-opacity="0.25" stroke-width="1.5"/>`
    + ticks
    + hand(hour, 26, 3.4, ink)
    + hand(minute, 38, 2.4, ink)
    + (showSec ? hand(second, 41, 1, accent) : "")
    + `<circle cx="50" cy="50" r="2.6" fill="${ink}"/>`
    + (showSec ? `<circle cx="50" cy="50" r="1.4" fill="${accent}"/>` : "")
    + `</svg>`;
}

/** Serialize a Css dict to an inline style string (camelCase → kebab-case). The
 *  render helpers already emit unit-ready values, so no unit inference is needed. */
export function inlineCss(css: Css): string {
  return Object.entries(css)
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${v}`)
    .join(";");
}

/**
 * The full inner HTML for a clock node — digital numerals or an analog face,
 * with an optional date line beneath — as one string shared by the player and
 * builder. `h` seeds proportional sizing (intrinsic height under uniform scaling,
 * the box height otherwise). */
export function clockBodyHtml(d0: Date, style: Style, config: Config, h: number): string {
  const d = zonedDate(d0, str(config.tz));
  const analog = clockIsAnalog(config);
  const main = analog
    ? analogClockSvg(d, style, config)
    : `<div style="${inlineCss(textCss("clock", style, config, h))}">${formatClock(d, clockFormat(config))}</div>`;
  const tzLabel = str(config.tzLabel).trim();
  const labelHtml = tzLabel
    ? `<div style="text-align:center;color:${str(style.color, "var(--w-fg, #ffffff)")};opacity:0.6;font-family:var(--w-font, 'Hanken Grotesk',system-ui,sans-serif);font-weight:600;font-size:${Math.max(10, Math.round(h * (analog ? 0.09 : 0.15)))}px;letter-spacing:0.08em;text-transform:uppercase;white-space:nowrap;overflow:hidden">${tzLabel}</div>`
    : "";
  if (!bool(config.showDate) && !tzLabel) {
    return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center">${main}</div>`;
  }
  if (!bool(config.showDate)) {
    return `<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${Math.round(h * 0.02)}px">${main}${labelHtml}</div>`;
  }
  const df = Math.max(11, Math.round(h * (analog ? 0.11 : 0.2)));
  const date = formatDate(d, str(config.dateVariant, "medium"));
  const dateLine = tzLabel ? `${tzLabel} · ${date}` : date;
  return (
    `<div style="width:100%;height:100%;display:flex;flex-direction:column;box-sizing:border-box">`
    + `<div style="flex:1;min-height:0;display:flex;align-items:center;justify-content:center">${main}</div>`
    + `<div style="text-align:center;color:${str(style.color, "var(--w-fg, #ffffff)")};opacity:0.78;font-family:var(--w-font, 'Hanken Grotesk',system-ui,sans-serif);font-weight:500;font-size:${df}px;padding-bottom:${Math.round(h * 0.03)}px;white-space:nowrap;overflow:hidden">${dateLine}</div>`
    + `</div>`
  );
}

export const DATE_VARIANTS: { id: string; label: string }[] = [
  { id: "full", label: "Full — Monday, January 6, 2026" },
  { id: "long", label: "Long — January 6, 2026" },
  { id: "medium", label: "Medium — Mon, Jan 6" },
  { id: "short", label: "Short — Jan 6" },
  { id: "weekday", label: "Weekday — Monday" },
  { id: "numeric", label: "Numeric — 01/06/2026" },
];

export function formatDate(d: Date, variant: string): string {
  const opts: Intl.DateTimeFormatOptions =
    variant === "full"
      ? { weekday: "long", month: "long", day: "numeric", year: "numeric" }
      : variant === "long"
        ? { month: "long", day: "numeric", year: "numeric" }
        : variant === "short"
          ? { month: "short", day: "numeric" }
          : variant === "weekday"
            ? { weekday: "long" }
            : variant === "numeric"
              ? { year: "numeric", month: "2-digit", day: "2-digit" }
              : { weekday: "short", month: "short", day: "numeric" }; // medium
  return new Intl.DateTimeFormat("en-US", opts).format(d);
}

/** Live display string for a text/clock/date node. */
export function textDisplay(type: WidgetType, config: Config, nowMs: number): string {
  if (type === "clock") return formatClock(new Date(nowMs), clockFormat(config));
  if (type === "date") return formatDate(new Date(nowMs), str(config.variant, "full"));
  return str(config.text, "Text");
}
