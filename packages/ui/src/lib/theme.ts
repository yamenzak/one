/**
 * Theming (SPEC §7 branding) — brand presets + runtime application. A tenant
 * themes the app for their clients by choosing a preset, a custom primary, a
 * palette extracted from their logo, or granular token overrides (including a
 * pasted shadcn theme). We apply branding by injecting a single <style> element
 * whose rules target `:root` (dark) and `:root[data-theme="light"]` (light), so
 * the whole shadcn token system re-skins live and stays mode-aware.
 */

import type { MarkStyle } from "./mark.js";

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
  /** Elevation preset — scales every `--shadow-*` token together. */
  shadow?: ShadowPreset | null;
  /** Hairline weight in px (`--border-width`). 0 removes every border app-wide. */
  borderWidth?: number | null;
  /**
   * Which way the neutral surfaces are tinted.
   *
   * NOT a runtime token — `applyBranding` ignores it, because the tint is already
   * baked into the `tokens` it generated. It is stored so the editor can show
   * which tint is in force, and so REGENERATING from a new brand colour keeps it.
   * Without it, `deriveTokens` silently fell back to "brand" on the next colour
   * change and threw the studio's choice away.
   */
  neutral?: NeutralTint | null;
  /** Hairline colour (`--border` + `--input`). Applied to BOTH modes; the
   *  advanced token editor can still set a different one per mode. */
  borderColor?: string | null;
  /** Tenant's default mode; the user can still toggle. */
  defaultMode?: ThemeMode | null;
  /**
   * Tint the active nav tab by its section's domain token (Train green, Eat
   * amber…). Defaults on.
   *
   * Like `neutral`, NOT a runtime token — no `--var` carries it; the Shell reads
   * it and passes `tinted` to the nav. It lives in branding rather than in a
   * per-device preference because it is a decision about how the STUDIO looks:
   * two clients of the same studio should not see differently-coloured chrome,
   * and a studio that has dialled its palette down to two greys does not want a
   * rainbow tab bar reintroduced by whatever each phone happened to store.
   */
  tintedNav?: boolean | null;
  /** Wash each page's hero in its section's domain token. Studio-wide for the
   *  same reason as `tintedNav`. Defaults on. */
  ambient?: boolean | null;
  /** Wide wordmark/logo (app bar), for a DARK surface. */
  logoUrl?: string | null;
  /** Square app icon/mark (nav rail, favicon), for a DARK surface. */
  iconUrl?: string | null;
  /** The same two for a LIGHT surface. Absent = use the dark one. */
  logoUrlLight?: string | null;
  iconUrlLight?: string | null;
  /**
   * How a GENERATED mark was set — the icon's letters and which characters of
   * the name carry the accent or sit quieter.
   *
   * Generation INPUT, never a runtime token: the output is an ordinary uploaded
   * PNG and every consumer reads that. It is stored for the same reason
   * `neutral` is — without it, coming back to regenerate after a colour change
   * silently discards the studio's choices and hands back the default.
   */
  mark?: MarkStyle | null;
  /** Avatar for the AI coach persona (falls back to a bottts robot). */
  aiAvatarUrl?: string | null;
  /** Name for the AI coach persona (falls back to "Coach"). */
  aiName?: string | null;
  /** Granular token overrides (e.g. from a pasted shadcn theme). */
  tokens?: BrandTokens | null;
}

/**
 * The mark to draw on the surface currently showing.
 *
 * ONE resolver, because "logo, or icon, or the other one, or nothing" was
 * already spelled out at five call sites before a second variant existed —
 * boot splash, login, the doors list, the switcher, the favicon — and each
 * ordered the fallbacks slightly differently. Adding a light variant to five
 * hand-written chains is how four of them end up right.
 *
 * `kind` is which SHAPE the surface wants. A wide wordmark in a 40px square
 * looks broken, and a square mark stretched across an app bar looks worse, so
 * the caller says which it is and the resolver falls back WITHIN that
 * preference first.
 *
 * A studio with one full-colour mark uploads nothing extra and this returns it
 * for both modes — the light variant is an override, never a requirement.
 */
export interface BrandMarks {
  logoUrl?: string | null;
  iconUrl?: string | null;
  logoUrlLight?: string | null;
  iconUrlLight?: string | null;
}

export function brandMark(
  /**
   * Just the four URLs, not a `Branding`.
   *
   * Callers hold several near-identical branding shapes — the design system's,
   * the wire type, a persona row on the studio switcher — and none is assignable
   * to another. Taking the fields this actually reads means no call site has to
   * cast, and a cast is exactly how a resolver like this ends up handed the
   * wrong object.
   */
  b: BrandMarks | null | undefined,
  mode: ThemeMode,
  kind: "logo" | "icon" = "icon",
): string | null {
  if (!b) return null;
  const light = mode === "light";
  const logo = (light && b.logoUrlLight) || b.logoUrl || null;
  const icon = (light && b.iconUrlLight) || b.iconUrl || null;
  return kind === "logo" ? logo || icon : icon || logo;
}

/**
 * Whether the mark `brandMark(b, mode, "logo")` returns is a WORDMARK — an image
 * that already contains the studio's name.
 *
 * The distinction is not cosmetic. A surface that anchors on the studio (the
 * sign-in screen) draws the mark and then writes the name under it, which is
 * right for a square icon and duplicated for a wordmark — and the generator in
 * `mark.ts` draws the studio's NAME into the wordmark it makes, so every studio
 * that used it saw its name twice. The condition mirrors `brandMark`'s logo
 * branch exactly: if that branch fell through to the icon, this is false and the
 * written name is the only place the name appears.
 */
export function hasWordmark(b: BrandMarks | null | undefined, mode: ThemeMode): boolean {
  if (!b) return false;
  return Boolean((mode === "light" && b.logoUrlLight) || b.logoUrl);
}

/**
 * The mirror: whether `brandMark(b, mode, "icon")` returned a SQUARE mark, or
 * fell through to the wide one.
 *
 * A square slot crops what it is given (`object-cover`), which is right for an
 * icon and destroys a wordmark — the middle third of the studio's name, at
 * 40px, in the nav rail and on the boot screen. Callers use this to switch to
 * `object-contain` when what they were handed is not the shape of the hole.
 */
export function hasIcon(b: BrandMarks | null | undefined, mode: ThemeMode): boolean {
  if (!b) return false;
  return Boolean((mode === "light" && b.iconUrlLight) || b.iconUrl);
}

/**
 * Elevation presets. Shadows are a brand decision — a clinical studio wants
 * hairlines and a boutique one wants depth — so they are configurable rather
 * than baked in, and they are PRESETS rather than free-form CSS: a mistyped
 * box-shadow is a broken app, and there is no useful middle ground between
 * "flat" and "dramatic" that a customer needs to dial in by hand.
 *
 * `soft` reproduces the shipped `tokens.css` values exactly, so a tenant that
 * never touches this setting is unaffected.
 */
export type ShadowPreset = "none" | "subtle" | "soft" | "dramatic";

/** Hairline weights offered in the brand editor. */
export const BORDER_WIDTHS: { value: number; label: string }[] = [
  { value: 0, label: "None" },
  { value: 1, label: "Hairline" },
  { value: 2, label: "Bold" },
];

export const SHADOW_PRESETS: { id: ShadowPreset; label: string; hint: string }[] = [
  { id: "none", label: "Flat", hint: "No shadows at all — hairlines carry the layering." },
  { id: "subtle", label: "Subtle", hint: "Barely-there lift. Clean and clinical." },
  { id: "soft", label: "Soft", hint: "The default — grounded but quiet." },
  { id: "dramatic", label: "Dramatic", hint: "Deep, high-contrast elevation." },
];

/** The three elevation steps for each preset, in `--shadow-sm/md/lg` order. */
const SHADOW_SCALE: Record<ShadowPreset, [string, string, string]> = {
  none: ["none", "none", "none"],
  subtle: [
    "0 1px 1px 0 oklch(0 0 0 / 0.16)",
    "0 2px 8px -3px oklch(0 0 0 / 0.22)",
    "0 6px 20px -6px oklch(0 0 0 / 0.28)",
  ],
  // Verbatim from tokens.css — the shipped look, so an untouched tenant sees no change.
  soft: [
    "0 1px 2px 0 oklch(0 0 0 / 0.3)",
    "0 4px 16px -4px oklch(0 0 0 / 0.4)",
    "0 12px 40px -8px oklch(0 0 0 / 0.5)",
  ],
  dramatic: [
    "0 2px 4px 0 oklch(0 0 0 / 0.45)",
    "0 8px 28px -4px oklch(0 0 0 / 0.6)",
    "0 24px 64px -12px oklch(0 0 0 / 0.72)",
  ],
};

/**
 * Every token the design system itself owns, grouped for the advanced editor.
 *
 * An app appends its OWN accent groups (Kova: `KOVA_TOKEN_GROUPS` in
 * `registry/tones.ts`). The groups that used to be here — "Macros" and "Domain
 * accents" — were the only part of the editor that knew what protein is.
 */
export const THEME_TOKEN_GROUPS: { label: string; tokens: string[] }[] = [
  { label: "Surfaces", tokens: ["background", "foreground", "card", "card-foreground", "surface-2", "surface-3", "popover", "popover-foreground", "scrim"] },
  { label: "Brand & UI", tokens: ["primary", "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground", "accent", "accent-foreground", "border", "input", "ring"] },
  { label: "Status", tokens: ["destructive", "destructive-foreground", "success", "success-soft", "warning", "warning-soft", "danger", "danger-soft"] },
];

/**
 * The shipped token values (mirrors tokens.css) — editor placeholders and swatch
 * defaults, so a blank field visibly falls back to the default.
 *
 * The design system's own tokens only. An app merges its accent defaults in
 * (Kova: `DEFAULT_ACCENT_TOKENS` in `registry/tones.ts`), for the same reason
 * the accents themselves are not in `tokens.css`.
 */
export const DEFAULT_TOKENS: BrandTokens = {
  dark: {
    "--background": "oklch(0.165 0.006 285)", "--foreground": "oklch(0.975 0.003 285)",
    "--card": "oklch(0.202 0.006 285)", "--card-foreground": "oklch(0.975 0.003 285)",
    "--surface-2": "oklch(0.235 0.007 285)", "--surface-3": "oklch(0.275 0.008 285)",
    "--popover": "oklch(0.21 0.006 285)", "--popover-foreground": "oklch(0.975 0.003 285)",
    "--primary": "oklch(0.74 0.15 164)", "--primary-foreground": "oklch(0.17 0.03 164)",
    "--secondary": "oklch(0.245 0.007 285)", "--secondary-foreground": "oklch(0.975 0.003 285)",
    "--muted": "oklch(0.245 0.007 285)", "--muted-foreground": "oklch(0.7 0.012 285)",
    "--accent": "oklch(0.275 0.008 285)", "--accent-foreground": "oklch(0.975 0.003 285)",
    "--border": "oklch(0.3 0.008 285 / 0.55)", "--input": "oklch(0.3 0.008 285)", "--ring": "oklch(0.74 0.15 164)",
    "--destructive": "oklch(0.62 0.2 24)", "--destructive-foreground": "oklch(0.98 0.01 24)",
    "--success": "oklch(0.76 0.14 158)", "--success-soft": "oklch(0.34 0.06 158)",
    "--warning": "oklch(0.82 0.13 88)", "--warning-soft": "oklch(0.36 0.06 88)",
    "--danger": "oklch(0.66 0.19 24)", "--danger-soft": "oklch(0.34 0.08 24)",
  },
  light: {
    "--background": "oklch(0.985 0.002 285)", "--foreground": "oklch(0.2 0.01 285)",
    "--card": "oklch(1 0 0)", "--card-foreground": "oklch(0.2 0.01 285)",
    "--surface-2": "oklch(0.965 0.003 285)", "--surface-3": "oklch(0.94 0.004 285)",
    "--popover": "oklch(1 0 0)", "--popover-foreground": "oklch(0.2 0.01 285)",
    "--primary": "oklch(0.62 0.14 164)", "--primary-foreground": "oklch(0.99 0.01 164)",
    "--secondary": "oklch(0.955 0.004 285)", "--secondary-foreground": "oklch(0.24 0.01 285)",
    "--muted": "oklch(0.955 0.004 285)", "--muted-foreground": "oklch(0.5 0.012 285)",
    "--accent": "oklch(0.94 0.005 285)", "--accent-foreground": "oklch(0.24 0.01 285)",
    "--border": "oklch(0.9 0.005 285)", "--input": "oklch(0.9 0.005 285)", "--ring": "oklch(0.62 0.14 164)",
    "--destructive": "oklch(0.58 0.2 24)", "--destructive-foreground": "oklch(0.99 0.01 24)",
    "--success": "oklch(0.58 0.15 158)", "--success-soft": "oklch(0.93 0.06 158)",
    "--warning": "oklch(0.7 0.14 78)", "--warning-soft": "oklch(0.95 0.08 88)",
    "--danger": "oklch(0.58 0.2 24)", "--danger-soft": "oklch(0.95 0.06 24)",
  },
};

/** Any CSS color string → an approximate #rrggbb for a native color input. */
export function colorToHex(v: string | undefined): string {
  const s = (v ?? "").trim();
  if (s.startsWith("#")) { const h = s.slice(1); return `#${(h.length === 3 ? h.split("").map((x) => x + x).join("") : h.slice(0, 6)).padEnd(6, "0")}`; }
  if (s.startsWith("oklch")) return oklchStringToHex(s);
  return "#808080";
}

/**
 * App-specific tokens a pasted theme won't define, and where to source them from
 * so the whole app re-skins even when the theme only sets the standard set. Each
 * target derives from the first source token present.
 */
const DERIVED_TOKENS: [target: string, sources: string[]][] = [
  ["--surface-2", ["--muted", "--secondary", "--accent", "--card"]],
  ["--surface-3", ["--accent", "--secondary", "--muted", "--card"]],
  ["--popover", ["--card"]],
  ["--card-foreground", ["--foreground"]],
  ["--popover-foreground", ["--foreground"]],
  ["--secondary-foreground", ["--foreground"]],
  ["--accent-foreground", ["--foreground"]],
];

function fillDerived(map: Record<string, string>): Record<string, string> {
  for (const [target, sources] of DERIVED_TOKENS) {
    if (map[target]) continue;
    for (const s of sources) if (map[s]) { map[target] = map[s]; break; }
  }
  return map;
}

/**
 * The structural tokens that are NOT fills, so nothing may be laid on top of
 * them by tone. Everything else a theme can override — `--primary`,
 * `--destructive`, the status tones, and every accent an app registers — IS a
 * fill, and therefore owes a readable on-colour.
 *
 * Spelled as a deny-list rather than an allow-list because the allow side is
 * open: `@4dl/ui` cannot enumerate an app's accents (that is the whole reason
 * they live in the app), while its own structural set is closed and known here.
 */
const NON_FILL_TOKENS = new Set([
  "--background", "--foreground", "--card", "--popover", "--secondary", "--muted",
  "--accent", "--border", "--input", "--ring", "--scrim", "--surface-2", "--surface-3",
]);

/**
 * Give every overridden FILL a measured on-colour, unless the theme set one.
 *
 * The advanced token editor writes raw variables, and it writes them one at a
 * time: a studio that darkens `--calories` by hand changes the colour a filled
 * chip is painted and NOT the ink on it, so the pair drifts apart silently and
 * the chip ends up dark-on-dark. `--primary` had the same hole from the other
 * direction — `primaryForeground` is derived from the `primary` FIELD, so a
 * primary set through the token editor kept the old foreground.
 *
 * An explicit `--x-foreground` in the same override always wins: this fills a
 * gap, it does not overrule a choice.
 */
function fillOnColors(map: Record<string, string>): Record<string, string> {
  for (const key of Object.keys(map)) {
    if (NON_FILL_TOKENS.has(key) || key.endsWith("-foreground") || key.endsWith("-soft")) continue;
    const fg = `${key}-foreground`;
    if (map[fg]) continue;
    const p = parseColor(map[key]);
    if (p) map[fg] = bestForeground(p.l, p.c, p.h);
  }
  return map;
}

export function presetById(id: string | null | undefined): BrandPreset | undefined {
  return BRAND_PRESETS.find((p) => p.id === id);
}

function cssBlock(vars: Record<string, string>): string {
  return Object.entries(vars).map(([k, v]) => `${k}:${v};`).join("");
}

/**
 * The stylesheet a branding produces — pure, so it can be tested.
 *
 * Split out of `applyBranding` because ALL the judgement lives here: which
 * tokens get written, how the elevation preset expands, and the clamping that
 * keeps a bad number out of the page's CSS. `applyBranding` is then a two-line
 * DOM write with nothing left to get wrong. Without the split, none of it was
 * reachable from a test — the UI package has no DOM environment, and adding one
 * to test string concatenation would be the wrong trade.
 */
export function brandingCss(branding: Branding | null | undefined): string {
  const preset = presetById(branding?.preset);
  const primary = branding?.primary || preset?.primary;
  // Always guarantee a readable on-primary color: if the tenant set a primary but
  // no explicit foreground, derive the higher-contrast on-color from the primary
  // itself. Otherwise a light/pastel custom primary in light mode keeps the
  // default near-white foreground and renders white-on-light (fails contrast).
  const primaryFg =
    branding?.primaryForeground || preset?.primaryForeground || (primary ? foregroundFor(primary) : undefined);

  const dark: Record<string, string> = {};
  const light: Record<string, string> = {};
  if (primary) {
    // In light mode, deepen the primary fill just enough that a light on-primary
    // foreground (white text on a brand button/pill) clears WCAG AA — several
    // presets pair a near-white foreground with a mid-light primary that reads
    // only ~3.5:1. Keeps the "white-on-brand" look (vs flipping to dark text) and
    // sharpens `text-primary` accents on white too. Dark mode keeps the brighter
    // primary so accents stay vivid on the dark surface.
    const primaryLight = primaryFg ? deepenPrimaryForLightFg(primary, primaryFg) : primary;
    dark["--primary"] = primary; dark["--ring"] = primary;
    light["--primary"] = primaryLight; light["--ring"] = primaryLight;
  }
  if (primaryFg) { dark["--primary-foreground"] = primaryFg; light["--primary-foreground"] = primaryFg; }
  // Hairline colour is a single choice applied to both modes (a per-mode value is
  // still reachable through the advanced token editor, and wins because the
  // spread below lands after this).
  if (branding?.borderColor) {
    for (const bag of [dark, light]) { bag["--border"] = branding.borderColor; bag["--input"] = branding.borderColor; }
  }
  Object.assign(dark, branding?.tokens?.dark ?? {});
  Object.assign(light, branding?.tokens?.light ?? {});
  // After the overrides, not before: a hand-set fill needs its ink recomputed,
  // and the editor only ever writes the fill.
  fillOnColors(dark);
  fillOnColors(light);

  let rootExtra = branding?.radius != null ? `--radius:${branding.radius}rem;` : "";
  // Elevation: one preset drives all three steps, so `shadow-sm/md/lg` anywhere
  // in the app scales together. `--shadow-glow` is deliberately untouched — it is
  // derived from the brand primary and is an accent, not an elevation step.
  const scale = branding?.shadow ? SHADOW_SCALE[branding.shadow] : undefined;
  if (scale) rootExtra += `--shadow-sm:${scale[0]};--shadow-md:${scale[1]};--shadow-lg:${scale[2]};`;
  // Hairline weight. Clamped rather than trusted: this value lands in a
  // stylesheet, and a NaN or a negative would take out every border silently.
  if (branding?.borderWidth != null && Number.isFinite(branding.borderWidth)) {
    rootExtra += `--border-width:${Math.max(0, Math.min(4, branding.borderWidth))}px;`;
  }
  return `:root{${rootExtra}${cssBlock(dark)}}` + `:root[data-theme="light"]{${cssBlock(light)}}`;
}

/**
 * The two names this module writes into the DOCUMENT and into LOCAL STORAGE.
 *
 * Both used to be `kova-*`. They are the app's, not the design system's, and
 * they are not cosmetic: the storage key is the one thing a user's chosen
 * light/dark mode survives sign-out in, so changing it after launch silently
 * resets everyone's preference. Pick once, at startup, and never again.
 *
 * The defaults are deliberately unbranded rather than a guess at a product
 * name — two 4DL apps on the same origin would otherwise fight over one key.
 */
export interface ThemeNames {
  /** `localStorage` key holding the user's light/dark choice. */
  storageKey: string;
  /** `id` of the injected `<style>` element carrying tenant branding. */
  styleId: string;
}

let names: ThemeNames = { storageKey: "ui-theme", styleId: "ui-branding" };

/** Bind the app's theme names once, before anything renders. */
export function configureTheme(next: Partial<ThemeNames>): void {
  names = { ...names, ...next };
}

/** Apply a tenant's branding by injecting/refreshing the branding stylesheet. */
export function applyBranding(branding: Branding | null | undefined): void {
  if (typeof document === "undefined") return;
  let el = document.getElementById(names.styleId) as HTMLStyleElement | null;
  if (!el) { el = document.createElement("style"); el.id = names.styleId; document.head.appendChild(el); }
  el.textContent = brandingCss(branding);
}

/** Read the user's mode preference (falls back to tenant default, else dark). */
export function resolveMode(tenantDefault?: ThemeMode | null): ThemeMode {
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem(names.storageKey);
    if (saved === "light" || saved === "dark") return saved;
  }
  return tenantDefault ?? "dark";
}

export function applyMode(mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  if (mode === "light") document.documentElement.dataset.theme = "light";
  else delete document.documentElement.dataset.theme;
  try {
    localStorage.setItem(names.storageKey, mode);
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

/** WCAG relative luminance for an sRGB triple (0–255). */
export function relLuminance(r: number, g: number, b: number): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}
const contrastRatio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const oklchLum = (l: number, c: number, h: number): number => { const { r, g, b } = oklchToRgb(l, c, h); return relLuminance(r, g, b); };

/**
 * Deepen a primary just enough that a LIGHT on-primary foreground (white-ish
 * text) clears WCAG AA (4.5:1) against it — used for the light-mode fill so brand
 * buttons/pills stay "white text on brand color" and remain readable. A dark
 * foreground wants a light primary, so those are left untouched. Only ever
 * lowers lightness; hue and chroma are preserved.
 */
function deepenPrimaryForLightFg(primary: string, fg: string): string {
  const p = parseColor(primary), f = parseColor(fg);
  if (!p || !f) return primary;
  const fgLum = oklchLum(f.l, f.c, f.h);
  if (fgLum < 0.5) return primary; // dark foreground → needs a light primary; leave as-is
  let L = p.l;
  for (let i = 0; i < 60 && contrastRatio(fgLum, oklchLum(L, p.c, p.h)) < 4.5; i++) {
    L -= 0.01;
    if (L <= 0.32) break;
  }
  return L < p.l ? ok(L, p.c, p.h) : primary;
}

/**
 * Pick the on-color (near-white or near-dark, hue-matched) that has the higher
 * WCAG contrast against a background OKLCH. A luminance threshold mis-calls
 * mid-lightness saturated colors (where white and black are both borderline);
 * measuring the actual ratio and taking the winner is robust across the gamut.
 */
function bestForeground(l: number, c: number, h: number): string {
  const bg = oklchToRgb(l, c, h);
  const bgLum = relLuminance(bg.r, bg.g, bg.b);
  const w = oklchToRgb(0.99, 0.01, h), d = oklchToRgb(0.2, 0.02, h);
  const cWhite = contrastRatio(bgLum, relLuminance(w.r, w.g, w.b));
  const cDark = contrastRatio(bgLum, relLuminance(d.r, d.g, d.b));
  return cDark >= cWhite ? ok(0.2, 0.02, h) : ok(0.99, 0.01, h);
}

/** A readable foreground (near-white or near-dark) for a given primary. */
export function foregroundFor(oklchOrHex: string): string {
  const p = parseColor(oklchOrHex) ?? { l: 0.6, c: 0.15, h: 285 };
  return bestForeground(p.l, p.c, p.h);
}

// ── Palette generator (one brand color → a full, coherent light+dark theme) ──

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Read any `oklch(l c h)` or `#hex` color into OKLCH; null if unparseable. */
export function parseColor(v: string | undefined | null): { l: number; c: number; h: number } | null {
  if (!v) return null;
  const s = v.trim();
  const m = /oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+)/i.exec(s);
  if (m) {
    const l = m[1]!.endsWith("%") ? parseFloat(m[1]!) / 100 : parseFloat(m[1]!);
    const c = m[2]!.endsWith("%") ? (parseFloat(m[2]!) / 100) * 0.4 : parseFloat(m[2]!);
    const h = parseFloat(m[3]!);
    if ([l, c, h].every(Number.isFinite)) return { l, c, h };
  }
  if (s.startsWith("#")) { const { l, c, h } = rgbToOklchHex(s); return { l, c, h }; }
  return null;
}

function rgbToOklchHex(hex: string) {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((x) => x + x).join("") : m;
  return rgbToOklch(parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16));
}

const ok = (l: number, c: number, h: number) => `oklch(${r2(clamp(l, 0, 1))} ${r2(Math.max(0, c))} ${r2(((h % 360) + 360) % 360)})`;

const hueDelta = (a: number, b: number) => (((b - a + 540) % 360) - 180);

/**
 * One accent tone, described well enough to re-tint it toward any brand.
 *
 * `lL` (light-mode lightness) has to stay dark enough that text and icons in
 * this colour clear WCAG AA on their own pale `-soft` tint; `dL` (dark mode)
 * stays bright. That is the constraint the numbers encode, and it is why the
 * two lightnesses are separate rather than derived.
 */
export interface AccentSpec {
  name: string;
  hue: number;
  c: number;
  dL: number;
  lL: number;
}

/**
 * Derive accent tokens (+ `-soft`) for both modes, nudged toward the brand so
 * they read as one palette while staying distinct from each other.
 *
 * The SPEC is the app's — `calories`/`protein`/`carbs`/`fat` used to be
 * hard-coded here, which made this function the design system's opinion about
 * macronutrients.
 */
export function deriveAccents(
  spec: readonly AccentSpec[],
  brandHue: number,
  brandC: number,
): { light: Record<string, string>; dark: Record<string, string> } {
  const vivid = clamp(brandC / 0.15, 0.7, 1.15);
  const light: Record<string, string> = {};
  const dark: Record<string, string> = {};
  for (const m of spec) {
    const h = m.hue + hueDelta(m.hue, brandHue) * 0.12; // 12% pull toward brand
    const c = m.c * vivid;
    dark[`--${m.name}`] = ok(m.dL, c, h);
    dark[`--${m.name}-soft`] = ok(0.35, c * 0.42, h);
    light[`--${m.name}`] = ok(m.lL, c, h);
    light[`--${m.name}-soft`] = ok(0.94, c * 0.4, h);
    /*
      THE INK FOR A SOLID FILL OF THIS TONE, per tone and per mode.

      A single shared `--tone-foreground` only works while every accent in a
      mode sits at a similar lightness — true of a hand-tuned default set, and
      false the moment these are DERIVED: `lL`/`dL` come from the app's spec and
      the chroma is scaled by the brand's, so one studio's `carbs` can be light
      enough to need dark ink while another's is not.

      `bestForeground` measures the actual WCAG ratio of near-white and
      near-black against this exact colour and returns the winner, which is
      robust across the whole gamut — a lightness threshold mis-calls
      mid-lightness saturated colours, where both are borderline.
    */
    dark[`--${m.name}-foreground`] = bestForeground(m.dL, c, h);
    light[`--${m.name}-foreground`] = bestForeground(m.lL, c, h);
  }
  return { light, dark };
}

/** Neutral-surface hue + chroma multiplier from a tint preset + the brand hue. */
export type NeutralTint = "brand" | "gray" | "cool" | "warm";
function neutralTint(kind: NeutralTint, brandHue: number): { hue: number; c: number } {
  switch (kind) {
    case "gray": return { hue: brandHue, c: 0 };
    case "cool": return { hue: 255, c: 1 };
    case "warm": return { hue: 70, c: 1 };
    default: return { hue: brandHue, c: 1 }; // "brand"
  }
}

/**
 * Generate a full, coherent token set (light + dark) from one brand colour.
 * The neutrals track the shipped lightness ramp, tinted toward the brand (or a
 * chosen neutral). The produced tokens are authoritative and stay editable —
 * this is a convenience generator, not a lock-in.
 */
export function deriveTokens(input: { primary: string; neutral?: NeutralTint; accents?: readonly AccentSpec[] }): BrandTokens {
  const p = parseColor(input.primary) ?? { l: 0.74, c: 0.15, h: 164 };
  const { hue: nH, c: nc } = neutralTint(input.neutral ?? "brand", p.h);
  const pC = Math.min(p.c, 0.22);
  const lightL = clamp(p.l, 0.5, 0.72);
  const darkL = clamp(Math.max(p.l, 0.62), 0.6, 0.82);
  const pLight = ok(lightL, pC, p.h);
  const pDark = ok(darkL, pC, p.h);

  const light: Record<string, string> = {
    "--background": ok(0.985, 0.002 * nc, nH), "--foreground": ok(0.2, 0.01 * nc, nH),
    "--card": ok(1, 0, nH), "--card-foreground": ok(0.2, 0.01 * nc, nH),
    "--surface-2": ok(0.965, 0.003 * nc, nH), "--surface-3": ok(0.94, 0.004 * nc, nH),
    "--popover": ok(1, 0, nH), "--popover-foreground": ok(0.2, 0.01 * nc, nH),
    "--primary": pLight, "--primary-foreground": bestForeground(lightL, pC, p.h),
    "--secondary": ok(0.955, 0.004 * nc, nH), "--secondary-foreground": ok(0.24, 0.01 * nc, nH),
    "--muted": ok(0.955, 0.004 * nc, nH), "--muted-foreground": ok(0.5, 0.012 * nc, nH),
    "--accent": ok(0.94, 0.005 * nc, nH), "--accent-foreground": ok(0.24, 0.01 * nc, nH),
    "--border": ok(0.9, 0.005 * nc, nH), "--input": ok(0.9, 0.005 * nc, nH), "--ring": pLight,
  };
  const dark: Record<string, string> = {
    "--background": ok(0.165, 0.006 * nc, nH), "--foreground": ok(0.975, 0.003 * nc, nH),
    "--card": ok(0.202, 0.006 * nc, nH), "--card-foreground": ok(0.975, 0.003 * nc, nH),
    "--surface-2": ok(0.235, 0.007 * nc, nH), "--surface-3": ok(0.275, 0.008 * nc, nH),
    "--popover": ok(0.21, 0.006 * nc, nH), "--popover-foreground": ok(0.975, 0.003 * nc, nH),
    "--primary": pDark, "--primary-foreground": bestForeground(darkL, pC, p.h),
    "--secondary": ok(0.245, 0.007 * nc, nH), "--secondary-foreground": ok(0.975, 0.003 * nc, nH),
    "--muted": ok(0.245, 0.007 * nc, nH), "--muted-foreground": ok(0.7, 0.012 * nc, nH),
    "--accent": ok(0.275, 0.008 * nc, nH), "--accent-foreground": ok(0.975, 0.003 * nc, nH),
    "--border": ok(0.3, 0.008 * nc, nH), "--input": ok(0.3, 0.008 * nc, nH), "--ring": pDark,
  };
  // The app's accents, if it has any. An app with none gets a complete,
  // coherent token set anyway — which is the point of them being a parameter.
  const accents = deriveAccents(input.accents ?? [], p.h, pC);
  Object.assign(light, accents.light);
  Object.assign(dark, accents.dark);
  return { light, dark };
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
 * Parse a pasted theme (CSS) into per-mode token maps. Accepts EVERY `--*`
 * custom property (only color/radius tokens actually take effect via the token
 * layer, so extras are harmless), understands both modern oklch values
 * (`--background: oklch(1 0 0);`) and legacy HSL triplets (`--background: 0 0%
 * 100%;`, wrapped into `hsl(...)`), and fills app-specific surface tokens so the
 * whole app re-skins. Convention: `:root` is the LIGHT theme, `.dark` is dark.
 * Returns tokens plus an optional radius (rem) pulled out of `--radius`.
 */
export function parseThemeCss(css: string): { tokens: BrandTokens; radius: number | null } {
  const grab = (selectorNames: string[]): Record<string, string> => {
    for (const name of selectorNames) {
      const re = new RegExp(`${name.replace(/[.[\]"=]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "i");
      const m = re.exec(css);
      if (m) return parseDecls(m[1]!);
    }
    return {};
  };
  // A bare token dump with no selector is treated as the light/root block.
  const hasSelector = /\{/.test(css);
  const rootDecls = hasSelector ? grab([":root", "html"]) : parseDecls(css);
  const darkDecls = grab([".dark", '[data-theme="dark"]', ':root[data-theme="dark"]']);

  let radius: number | null = null;
  const pick = (decls: Record<string, string>): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [k, raw] of Object.entries(decls)) {
      const name = k.replace(/^--/, "");
      if (name === "radius") { const n = parseFloat(raw); if (!Number.isNaN(n) && raw.includes("rem")) radius = n; continue; }
      out[`--${name}`] = normalizeColor(raw);
    }
    return fillDerived(out);
  };

  const light = pick(rootDecls);
  const dark = Object.keys(darkDecls).length ? pick(darkDecls) : { ...light };
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
