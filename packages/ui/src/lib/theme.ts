/**
 * Theming (SPEC §7 branding) — brand presets + runtime application. A tenant
 * themes the app for their clients by choosing a preset, a custom primary, a
 * palette extracted from their logo, or granular token overrides (including a
 * pasted shadcn theme). We apply branding by injecting a single <style> element
 * whose rules target `:root` (dark) and `:root[data-theme="light"]` (light), so
 * the whole shadcn token system re-skins live and stays mode-aware.
 */

export type ThemeMode = "dark" | "light";

export interface BrandPreset {
  id: string;
  label: string;
  /** oklch strings. */
  primary: string;
  primaryForeground: string;
}

export const BRAND_PRESETS: BrandPreset[] = [
  { id: "emerald", label: "Emerald", primary: "oklch(0.74 0.15 164)", primaryForeground: "oklch(0.17 0.03 164)" },
  { id: "violet", label: "Violet", primary: "oklch(0.62 0.2 292)", primaryForeground: "oklch(0.99 0.01 292)" },
  { id: "blue", label: "Ocean", primary: "oklch(0.62 0.19 250)", primaryForeground: "oklch(0.99 0.01 250)" },
  { id: "cyan", label: "Cyan", primary: "oklch(0.74 0.13 208)", primaryForeground: "oklch(0.18 0.03 208)" },
  { id: "amber", label: "Amber", primary: "oklch(0.8 0.15 72)", primaryForeground: "oklch(0.2 0.04 72)" },
  { id: "rose", label: "Rose", primary: "oklch(0.66 0.22 14)", primaryForeground: "oklch(0.99 0.01 14)" },
  { id: "indigo", label: "Indigo", primary: "oklch(0.58 0.2 276)", primaryForeground: "oklch(0.99 0.01 276)" },
  { id: "lime", label: "Lime", primary: "oklch(0.82 0.19 128)", primaryForeground: "oklch(0.2 0.05 128)" },
  { id: "slate", label: "Mono", primary: "oklch(0.92 0.01 285)", primaryForeground: "oklch(0.2 0.01 285)" },
];

/** Per-mode CSS-variable override maps (var name → value). */
export interface BrandTokens {
  light?: Record<string, string> | null;
  dark?: Record<string, string> | null;
}

export interface Branding {
  preset?: string;
  /** Custom primary oklch/hex (overrides preset). */
  primary?: string | null;
  primaryForeground?: string | null;
  /** Radius in rem (0.4–1.4). */
  radius?: number | null;
  /** Tenant's default mode; the user can still toggle. */
  defaultMode?: ThemeMode | null;
  logoUrl?: string | null;
  /** Granular token overrides (e.g. from a pasted shadcn theme). */
  tokens?: BrandTokens | null;
}

/** The tokens the granular editor exposes — a curated, useful subset. */
export const EDITABLE_TOKENS: { var: string; label: string }[] = [
  { var: "--background", label: "Background" },
  { var: "--foreground", label: "Text" },
  { var: "--card", label: "Card" },
  { var: "--primary", label: "Primary" },
  { var: "--primary-foreground", label: "On primary" },
  { var: "--secondary", label: "Secondary" },
  { var: "--muted-foreground", label: "Muted text" },
  { var: "--accent", label: "Accent" },
  { var: "--border", label: "Border" },
];

/** shadcn token names we accept from a pasted theme (they map 1:1 to ours). */
const SHADCN_TOKENS = new Set([
  "background", "foreground", "card", "card-foreground", "popover", "popover-foreground",
  "primary", "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground",
  "accent", "accent-foreground", "destructive", "destructive-foreground", "border", "input", "ring",
]);

export function presetById(id: string | null | undefined): BrandPreset | undefined {
  return BRAND_PRESETS.find((p) => p.id === id);
}

function cssBlock(vars: Record<string, string>): string {
  return Object.entries(vars).map(([k, v]) => `${k}:${v};`).join("");
}

/** Apply a tenant's branding by injecting/refreshing the branding stylesheet. */
export function applyBranding(branding: Branding | null | undefined): void {
  if (typeof document === "undefined") return;
  const preset = presetById(branding?.preset);
  const primary = branding?.primary || preset?.primary;
  const primaryFg = branding?.primaryForeground || preset?.primaryForeground;

  const dark: Record<string, string> = {};
  const light: Record<string, string> = {};
  if (primary) { dark["--primary"] = primary; dark["--ring"] = primary; light["--primary"] = primary; light["--ring"] = primary; }
  if (primaryFg) { dark["--primary-foreground"] = primaryFg; light["--primary-foreground"] = primaryFg; }
  Object.assign(dark, branding?.tokens?.dark ?? {});
  Object.assign(light, branding?.tokens?.light ?? {});

  const rootExtra = branding?.radius != null ? `--radius:${branding.radius}rem;` : "";
  const css =
    `:root{${rootExtra}${cssBlock(dark)}}` +
    `:root[data-theme="light"]{${cssBlock(light)}}`;

  let el = document.getElementById("mossa-branding") as HTMLStyleElement | null;
  if (!el) { el = document.createElement("style"); el.id = "mossa-branding"; document.head.appendChild(el); }
  el.textContent = css;
}

/** Read the user's mode preference (falls back to tenant default, else dark). */
export function resolveMode(tenantDefault?: ThemeMode | null): ThemeMode {
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem("mossa-theme");
    if (saved === "light" || saved === "dark") return saved;
  }
  return tenantDefault ?? "dark";
}

export function applyMode(mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  if (mode === "light") document.documentElement.dataset.theme = "light";
  else delete document.documentElement.dataset.theme;
  try {
    localStorage.setItem("mossa-theme", mode);
  } catch {
    /* ignore */
  }
}

// ── Color conversion (sRGB ⇄ OKLCH) ─────────────────────────────────────────

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const srgbToLinear = (c: number) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
const linearToSrgb = (c: number) => Math.round(clamp01(c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055) * 255);

export function rgbToOklch(r: number, g: number, b: number): { l: number; c: number; h: number } {
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
  const L = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const M = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const S = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
  const l_ = Math.cbrt(L), m_ = Math.cbrt(M), s_ = Math.cbrt(S);
  const ll = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const aa = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  let h = (Math.atan2(bb, aa) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: ll, c: Math.hypot(aa, bb), h };
}

export function oklchToRgb(l: number, c: number, h: number): { r: number; g: number; b: number } {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr), b2 = c * Math.sin(hr);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b2;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b2;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b2;
  const L = l_ ** 3, M = m_ ** 3, S = s_ ** 3;
  return {
    r: linearToSrgb(4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S),
    g: linearToSrgb(-1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S),
    b: linearToSrgb(-0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S),
  };
}

const r2 = (n: number) => Math.round(n * 1000) / 1000;
const hex2 = (n: number) => n.toString(16).padStart(2, "0");

export function hexToOklchString(hex: string): string {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((x) => x + x).join("") : m;
  const r = parseInt(full.slice(0, 2), 16), g = parseInt(full.slice(2, 4), 16), b = parseInt(full.slice(4, 6), 16);
  const { l, c, h } = rgbToOklch(r, g, b);
  return `oklch(${r2(l)} ${r2(c)} ${r2(h)})`;
}

/** Parse an `oklch(l c h ...)` string and render an approximate #rrggbb. */
export function oklchStringToHex(str: string): string {
  const m = /oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)/i.exec(str);
  if (!m) return "#888888";
  const l = m[1]!.endsWith("%") ? parseFloat(m[1]!) / 100 : parseFloat(m[1]!);
  const { r, g, b } = oklchToRgb(l, parseFloat(m[2]!), parseFloat(m[3]!));
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

/** A readable foreground (near-white or near-black) for a given primary. */
export function foregroundFor(oklchOrHex: string): string {
  const hex = oklchOrHex.startsWith("#") ? oklchOrHex : oklchStringToHex(oklchOrHex);
  const full = hex.replace("#", "");
  const r = parseInt(full.slice(0, 2), 16), g = parseInt(full.slice(2, 4), 16), b = parseInt(full.slice(4, 6), 16);
  const { l } = rgbToOklch(r, g, b);
  return l > 0.65 ? "oklch(0.2 0.02 285)" : "oklch(0.99 0.01 285)";
}

/**
 * Extract a dominant, vibrant color from a logo image and return a brand
 * primary (+ readable foreground). Samples a downscaled copy on a canvas and
 * scores buckets by saturation × frequency, ignoring near-transparent and
 * near-gray pixels. Lightness is nudged into a usable band.
 */
export function extractPalette(img: HTMLImageElement): { primary: string; primaryForeground: string } | null {
  if (typeof document === "undefined") return null;
  const size = 48;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, size, size);
  let data: Uint8ClampedArray;
  try { data = ctx.getImageData(0, 0, size, size).data; } catch { return null; }

  const buckets = new Map<string, { r: number; g: number; b: number; n: number; score: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!, a = data[i + 3]!;
    if (a < 128) continue;
    const { l, c } = rgbToOklch(r, g, b);
    if (c < 0.04) continue; // skip near-gray
    if (l < 0.15 || l > 0.92) continue; // skip near-black / near-white
    const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
    const prev = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0, score: 0 };
    prev.r += r; prev.g += g; prev.b += b; prev.n += 1; prev.score += c;
    buckets.set(key, prev);
  }
  if (buckets.size === 0) return null;
  let best: { r: number; g: number; b: number; n: number; score: number } | null = null;
  for (const v of buckets.values()) if (!best || v.score > best.score) best = v;
  if (!best) return null;

  let { l, c, h } = rgbToOklch(best.r / best.n, best.g / best.n, best.b / best.n);
  l = Math.min(0.82, Math.max(0.58, l)); // keep it usable as an accent
  c = Math.min(c, 0.22);
  const primary = `oklch(${r2(l)} ${r2(c)} ${r2(h)})`;
  return { primary, primaryForeground: foregroundFor(primary) };
}

/**
 * Parse a pasted shadcn theme (CSS) into per-mode token maps. Understands both
 * modern oklch values (`--background: oklch(1 0 0);`) and legacy HSL triplets
 * (`--background: 0 0% 100%;`, wrapped into `hsl(...)`). shadcn's `:root` is the
 * LIGHT theme and `.dark` is dark — we map them to our light/dark buckets.
 * Returns tokens plus an optional radius (rem) pulled out of `--radius`.
 */
export function parseShadcnTheme(css: string): { tokens: BrandTokens; radius: number | null } {
  const grab = (selectorNames: string[]): Record<string, string> => {
    for (const name of selectorNames) {
      const re = new RegExp(`${name.replace(/[.[\]"=]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "i");
      const m = re.exec(css);
      if (m) return parseDecls(m[1]!);
    }
    return {};
  };
  const rootDecls = grab([":root", "html"]);
  const darkDecls = grab([".dark", '[data-theme="dark"]', ':root[data-theme="dark"]']);

  let radius: number | null = null;
  const pick = (decls: Record<string, string>): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [k, raw] of Object.entries(decls)) {
      const name = k.replace(/^--/, "");
      if (name === "radius") { const n = parseFloat(raw); if (!Number.isNaN(n) && raw.includes("rem")) radius = n; continue; }
      if (!SHADCN_TOKENS.has(name)) continue;
      out[`--${name}`] = normalizeColor(raw);
    }
    return out;
  };

  // shadcn :root = light, .dark = dark. If no .dark block, fall back to :root for both.
  const light = pick(rootDecls);
  const dark = Object.keys(darkDecls).length ? pick(darkDecls) : light;
  return { tokens: { light, dark }, radius };
}

function parseDecls(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of body.split(";")) {
    const idx = decl.indexOf(":");
    if (idx === -1) continue;
    const k = decl.slice(0, idx).trim();
    const v = decl.slice(idx + 1).trim();
    if (k.startsWith("--") && v) out[k] = v;
  }
  return out;
}

/** Wrap a bare HSL triplet in hsl(); leave functional colors (oklch/hsl/rgb/#) as-is. */
function normalizeColor(v: string): string {
  const s = v.trim();
  if (/^(oklch|hsl|rgb|hwb|lab|lch|color|var|#)/i.test(s)) return s;
  if (/^-?[\d.]+\s+[\d.]+%\s+[\d.]+%$/.test(s)) return `hsl(${s})`;
  return s;
}
