/**
 * Theming (SPEC §7 branding) — brand presets + runtime application. A tenant
 * themes the app for their clients by choosing a preset (or a custom primary +
 * radius). We apply it by overriding the CSS vars on the document root, so the
 * whole shadcn token system re-skins live. Persisted in tenant_settings.
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
}

export function presetById(id: string | null | undefined): BrandPreset | undefined {
  return BRAND_PRESETS.find((p) => p.id === id);
}

/** Apply a tenant's branding to the document root (idempotent). */
export function applyBranding(branding: Branding | null | undefined): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const preset = presetById(branding?.preset);
  const primary = branding?.primary || preset?.primary;
  const primaryFg = branding?.primaryForeground || preset?.primaryForeground;
  if (primary) {
    root.style.setProperty("--primary", primary);
    root.style.setProperty("--ring", primary);
  }
  if (primaryFg) root.style.setProperty("--primary-foreground", primaryFg);
  if (branding?.radius != null) root.style.setProperty("--radius", `${branding.radius}rem`);
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
