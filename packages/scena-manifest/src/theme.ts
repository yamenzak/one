/**
 * Theme (§6 · brand). The shadcn design tokens are the SINGLE source of truth
 * for a tenant's look: the dashboard UI, the AI generation brief, and the
 * on-screen widget theme all read from the same token set. A tenant's brand kit
 * is just those tokens (light + dark) plus a corner radius and a font pick.
 *
 * This module is the shared home for all token math:
 *  - `parseColor` / `hexToOklch` — read any oklch()/hex colour into OKLCH.
 *  - `deriveTokens` — a convenience *generator*: turn one brand colour into a
 *    full, coherent shadcn palette (light + dark). It only ever produces token
 *    values — the tokens remain authoritative and editable afterwards.
 *  - `widgetTokens` / `widgetThemeCss` — derive the on-screen `--w-*` widget
 *    theme (translucent brand glass + a vivid accent) FROM the resolved shadcn
 *    tokens, so widgets follow the very same brand as the UI.
 *
 * `DEFAULT_TOKENS` mirrors the shipped defaults in the dashboard's index.css, so
 * a partial brand theme (only a few tokens set) resolves to concrete values for
 * the AI brief and widget derivation.
 */

/** The shadcn design tokens, split by theme mode — a tenant's brand palette. */
export interface ThemeMaps {
  light: Record<string, string>;
  dark: Record<string, string>;
}

/** The brand kit: shadcn tokens (the source of truth) + radius + fonts. */
export interface BrandKit {
  brandName?: string;
  radius: number;
  bodyFont: string;
  headingFont?: string;
  theme: ThemeMaps;
}

/* ------------------------------- colour math ------------------------------ */

export interface Oklch { L: number; C: number; H: number }

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** sRGB hex → OKLCH; null if unparseable. */
export function hexToOklch(hex: string): Oklch | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(toLinear) as [number, number, number];
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const C = Math.sqrt(a * a + bb * bb);
  let H = (Math.atan2(bb, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H };
}

/** Read a CSS colour token into OKLCH — handles `oklch(L C H[/a])` and hex.
 *  Returns null for anything else (e.g. an hsl() paste), so callers fall back. */
export function parseColor(value: string | undefined): Oklch | null {
  if (!value) return null;
  const v = value.trim();
  const m = /^oklch\(\s*([0-9.]+%?)\s+([0-9.]+%?)\s+([0-9.]+)/i.exec(v);
  if (m) {
    const L = m[1]!.endsWith("%") ? parseFloat(m[1]!) / 100 : parseFloat(m[1]!);
    const C = m[2]!.endsWith("%") ? (parseFloat(m[2]!) / 100) * 0.4 : parseFloat(m[2]!);
    const H = parseFloat(m[3]!);
    if ([L, C, H].every(Number.isFinite)) return { L, C, H };
  }
  if (v.startsWith("#")) return hexToOklch(v);
  return null;
}

const r3 = (n: number): number => Math.round(n * 1000) / 1000;
const r1 = (n: number): number => Math.round(n * 10) / 10;

/** Format an OKLCH triple (+ optional alpha 0..1) as a CSS `oklch(...)` string. */
export function ok(L: number, C: number, H: number, a?: number): string {
  const base = `${r3(clamp(L, 0, 1))} ${r3(Math.max(0, C))} ${r1(((H % 360) + 360) % 360)}`;
  return a == null ? `oklch(${base})` : `oklch(${base} / ${r3(clamp(a, 0, 1))})`;
}

/** Neutral-surface hue + chroma multiplier from the tint preset + brand hue. */
function neutralTint(kind: string, brandHue: number): { hue: number; c: number } {
  switch (kind) {
    case "gray": return { hue: brandHue, c: 0 };
    case "cool": return { hue: 255, c: 1 };
    case "warm": return { hue: 70, c: 1 };
    default: return { hue: brandHue, c: 1 }; // "brand"
  }
}

/* ---------------------------- shadcn token names -------------------------- */

/** Every shadcn token the brand theme may set (an allowlist for validation). */
export const THEME_TOKENS = [
  "background", "foreground", "card", "card-foreground", "popover", "popover-foreground",
  "primary", "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground",
  "accent", "accent-foreground", "destructive", "destructive-foreground",
  "success", "success-foreground", "warning", "warning-foreground", "info", "info-foreground",
  "border", "input", "ring",
  "chart-1", "chart-2", "chart-3", "chart-4", "chart-5",
  "sidebar", "sidebar-foreground", "sidebar-primary", "sidebar-primary-foreground",
  "sidebar-accent", "sidebar-accent-foreground", "sidebar-border", "sidebar-ring",
] as const;

/** The shipped default token values (mirrors the dashboard's index.css), so a
 *  partial brand theme resolves to concrete colours for the AI brief + widgets. */
export const DEFAULT_TOKENS: ThemeMaps = {
  light: {
    background: "oklch(0.99 0.003 300)", foreground: "oklch(0.24 0.015 300)",
    primary: "oklch(0.58 0.17 300)", "primary-foreground": "oklch(0.99 0.003 300)",
    accent: "oklch(0.95 0.02 300)", "accent-foreground": "oklch(0.45 0.16 300)",
    "muted-foreground": "oklch(0.55 0.01 300)", border: "oklch(0.93 0.005 300)", ring: "oklch(0.58 0.17 300)",
    "chart-1": "oklch(0.58 0.17 300)", "chart-2": "oklch(0.65 0.15 250)",
  },
  dark: {
    background: "oklch(0.18 0.01 300)", foreground: "oklch(0.95 0.005 300)",
    primary: "oklch(0.68 0.17 300)", "primary-foreground": "oklch(0.18 0.01 300)",
    accent: "oklch(0.32 0.03 300)", "accent-foreground": "oklch(0.9 0.02 300)",
    "muted-foreground": "oklch(0.68 0.012 300)", border: "oklch(1 0 0 / 10%)", ring: "oklch(0.68 0.17 300)",
    "chart-1": "oklch(0.68 0.17 300)", "chart-2": "oklch(0.7 0.15 250)",
  },
};

/** Resolve a brand theme's tokens for a mode over the shipped defaults. */
export function resolveTokens(theme: ThemeMaps | undefined, mode: "light" | "dark"): Record<string, string> {
  return { ...DEFAULT_TOKENS[mode], ...(theme?.[mode] ?? {}) };
}

/* ------------------------ shadcn palette generator ------------------------ */

const DEFAULT_HUE = 300; // the shipped Scena violet

/** Foreground (text-on-color) for a given surface lightness. */
function contrastFg(L: number, hue: number): string {
  return L > 0.62 ? ok(0.2, 0.02, hue) : ok(0.99, 0.01, hue);
}

/** Generate a full, coherent shadcn palette (light + dark) from a brand colour.
 *  A convenience — the produced tokens are authoritative and stay editable. */
export function deriveTokens(input: { primary: string; secondary?: string; neutral?: string }): ThemeMaps {
  const p = parseColor(input.primary) ?? { L: 0.58, C: 0.17, H: DEFAULT_HUE };
  const a = parseColor(input.secondary || "") ?? { L: 0.72, C: 0.16, H: 60 };
  const pH = p.H, pC = p.C;
  const { hue: nH, c: nc } = neutralTint(input.neutral || "brand", pH);

  const pLightL = clamp(p.L, 0.45, 0.72);
  const pDarkL = clamp(Math.max(p.L, 0.6), 0.55, 0.82);
  const primaryLight = ok(pLightL, pC, pH);
  const primaryDark = ok(pDarkL, pC, pH);
  const accentC = Math.min(0.18, a.C);

  const light: Record<string, string> = {
    background: ok(0.99, 0.003 * nc, nH), foreground: ok(0.24, 0.015 * nc, nH),
    card: ok(1, 0, nH), "card-foreground": ok(0.24, 0.015 * nc, nH),
    popover: ok(1, 0, nH), "popover-foreground": ok(0.24, 0.015 * nc, nH),
    primary: primaryLight, "primary-foreground": contrastFg(pLightL, pH),
    secondary: ok(0.96, 0.006 * nc, nH), "secondary-foreground": ok(0.32, 0.015 * nc, nH),
    muted: ok(0.96, 0.006 * nc, nH), "muted-foreground": ok(0.55, 0.01 * nc, nH),
    accent: ok(0.95, 0.02 * nc, nH), "accent-foreground": ok(0.45, Math.min(0.16, pC), pH),
    border: ok(0.93, 0.005 * nc, nH), input: ok(0.93, 0.005 * nc, nH), ring: primaryLight,
    "chart-1": primaryLight, "chart-2": ok(0.68, accentC, a.H),
    "chart-3": ok(0.7, 0.14, pH - 60), "chart-4": ok(0.72, 0.16, pH - 120), "chart-5": ok(0.68, 0.18, pH + 60),
    sidebar: ok(1, 0, nH), "sidebar-foreground": ok(0.24, 0.015 * nc, nH),
    "sidebar-primary": primaryLight, "sidebar-primary-foreground": contrastFg(pLightL, pH),
    "sidebar-accent": ok(0.95, 0.02 * nc, nH), "sidebar-accent-foreground": ok(0.45, Math.min(0.16, pC), pH),
    "sidebar-border": ok(0.93, 0.005 * nc, nH), "sidebar-ring": primaryLight,
  };
  const dark: Record<string, string> = {
    background: ok(0.18, 0.01 * nc, nH), foreground: ok(0.95, 0.005 * nc, nH),
    card: ok(0.22, 0.012 * nc, nH), "card-foreground": ok(0.95, 0.005 * nc, nH),
    popover: ok(0.22, 0.012 * nc, nH), "popover-foreground": ok(0.95, 0.005 * nc, nH),
    primary: primaryDark, "primary-foreground": contrastFg(pDarkL, pH),
    secondary: ok(0.28, 0.015 * nc, nH), "secondary-foreground": ok(0.95, 0.005 * nc, nH),
    muted: ok(0.28, 0.015 * nc, nH), "muted-foreground": ok(0.68, 0.012 * nc, nH),
    accent: ok(0.32, 0.03 * nc, nH), "accent-foreground": ok(0.9, 0.03, pH),
    border: "oklch(1 0 0 / 10%)", input: "oklch(1 0 0 / 14%)", ring: primaryDark,
    "chart-1": primaryDark, "chart-2": ok(0.7, accentC, a.H),
    "chart-3": ok(0.72, 0.14, pH - 60), "chart-4": ok(0.74, 0.16, pH - 120), "chart-5": ok(0.72, 0.18, pH + 60),
    sidebar: ok(0.2, 0.012 * nc, nH), "sidebar-foreground": ok(0.95, 0.005 * nc, nH),
    "sidebar-primary": primaryDark, "sidebar-primary-foreground": contrastFg(pDarkL, pH),
    "sidebar-accent": ok(0.32, 0.03 * nc, nH), "sidebar-accent-foreground": ok(0.9, 0.03, pH),
    "sidebar-border": "oklch(1 0 0 / 10%)", "sidebar-ring": primaryDark,
  };
  return { light, dark };
}

/* ------------------------------ widget tokens ----------------------------- */

/** Every widget theme token (for docs/validation; widgets reference these). */
export const WIDGET_TOKENS = [
  "w-surface", "w-surface-2", "w-fg", "w-fg-muted",
  "w-accent", "w-accent-2", "w-border", "w-radius", "w-font", "w-font-mono",
] as const;

/** The default `--w-*` block (shipped look) — for the dashboard's base stylesheet. */
export const DEFAULT_WIDGET_TOKENS: Record<string, string> = {
  "w-surface": ok(0.18, 0.02, 300, 0.62),
  "w-surface-2": "oklch(1 0 0 / 0.06)",
  "w-fg": ok(0.99, 0.008, 300),
  "w-fg-muted": ok(0.99, 0.008, 300, 0.72),
  "w-accent": ok(0.66, 0.19, 300),
  "w-accent-2": ok(0.7, 0.15, 250),
  "w-border": "oklch(1 0 0 / 0.14)",
  "w-radius": "18px",
  "w-font": "'Hanken Grotesk', system-ui, sans-serif",
  "w-font-mono": "'JetBrains Mono', ui-monospace, monospace",
};

/**
 * The on-screen `--w-*` widget theme, derived FROM the resolved shadcn tokens:
 * a translucent dark "glass" surface tinted to the brand hue, with the brand's
 * primary as the vivid accent (widgets render over unpredictable backgrounds,
 * so surfaces stay dark glass while the accent carries the brand).
 */
export function widgetTokens(brand: { theme?: ThemeMaps; radius: number; bodyFont: string }): Record<string, string> {
  const dark = resolveTokens(brand.theme, "dark");
  const p = parseColor(dark.primary) ?? { L: 0.68, C: 0.17, H: 300 };
  const a = parseColor(dark["chart-2"]) ?? { L: 0.7, C: 0.15, H: 250 };
  // Surfaces/text follow the theme's neutral (the --background hue carries the
  // neutral tint); the accent follows the vivid --primary.
  const nH = parseColor(dark.background)?.H ?? p.H;
  const accentL = clamp(Math.max(p.L, 0.6), 0.6, 0.74);
  const font = (brand.bodyFont || "Hanken Grotesk").replace(/["\\]/g, "");
  return {
    "w-surface": ok(0.18, 0.02, nH, 0.62),
    "w-surface-2": "oklch(1 0 0 / 0.06)",
    "w-fg": ok(0.99, 0.008, nH),
    "w-fg-muted": ok(0.99, 0.008, nH, 0.72),
    "w-accent": ok(accentL, p.C, p.H),
    "w-accent-2": ok(clamp(Math.max(a.L, 0.6), 0.6, 0.8), a.C, a.H),
    "w-border": "oklch(1 0 0 / 0.14)",
    "w-radius": `${clamp(Math.round(brand.radius ?? 18), 0, 64)}px`,
    "w-font": `"${font}", 'Hanken Grotesk', system-ui, sans-serif`,
    "w-font-mono": "'JetBrains Mono', ui-monospace, monospace",
  };
}

/** Render a token map as a CSS `:root { --w-*: … }` block. */
export function widgetTokensCss(tokens: Record<string, string>): string {
  const lines = Object.entries(tokens).map(([k, v]) => `  --${k}: ${v};`);
  return `:root {\n${lines.join("\n")}\n}`;
}

/** The brand's widget-theme CSS block, injected on the player + builder. */
export function widgetThemeCss(brand: { theme?: ThemeMaps; radius: number; bodyFont: string }): string {
  return widgetTokensCss(widgetTokens(brand));
}
