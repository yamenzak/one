/**
 * Brand kit (§6) — the tenant's design tokens, corner radius, and typography.
 * The shadcn tokens are the SINGLE source of truth: the dashboard UI, the AI
 * generation brief, and the on-screen widget theme all read from them. A tenant
 * configures the tokens directly (a generate-from-colour helper, presets, a
 * pasted theme, or per-token edits); fonts are the one thing picked separately,
 * from the prepackaged asset fonts.
 *
 * Stored as a single JSON blob in app_config (`brand.json`). Legacy kits (which
 * carried primary/secondary/background/text hex fields) are migrated on read:
 * their colours are baked into the token maps once, so an existing tenant keeps
 * its look with no visible change.
 */
import { getConfigValue, setConfig } from "./billing-store.js";
import { DEMO_TENANT } from "./db.js";
import { deriveTokens, resolveTokens, THEME_TOKENS, type ThemeMaps } from "@scena/manifest";

/** A brand logo variant (uploaded to the media library, referenced by URL). */
export interface BrandLogo {
  id: string;
  /** Variant label, e.g. "Primary", "White", "Mark", "Wordmark". */
  label: string;
  /** Public asset URL (/api/assets/<hash>) served from R2. */
  url: string;
  mime?: string;
}

export interface Branding {
  brandName: string;
  radius: number;
  headingFont: string;
  bodyFont: string;
  /** The shadcn design tokens (light + dark) — the single source of truth. */
  theme: ThemeMaps;
  /** Uploaded brand logos (variants) — used by the logo widget + the AIs. */
  logos: BrandLogo[];
}

export const BRAND_DEFAULTS: Branding = {
  brandName: "",
  radius: 16,
  headingFont: "Inter",
  bodyFont: "Inter",
  theme: { light: {}, dark: {} },
  logos: [],
};

const TOKENS = new Set<string>(THEME_TOKENS);

/** Keep only allowlisted token → sane colour-string entries. */
function cleanTokenMap(m: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (m && typeof m === "object") {
    for (const [k, v] of Object.entries(m as Record<string, unknown>)) {
      if (TOKENS.has(k) && typeof v === "string" && v.trim() && v.length <= 64 && !/[;{}<>]/.test(v)) out[k] = v.trim();
    }
  }
  return out;
}

/** Keep only well-formed logo entries (id + url required). */
function cleanLogos(v: unknown): BrandLogo[] {
  if (!Array.isArray(v)) return [];
  const out: BrandLogo[] = [];
  for (const raw of v.slice(0, 24)) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    const url = typeof o.url === "string" ? o.url : "";
    if (!id || !url || url.length > 512 || /[<>"]/.test(url)) continue;
    out.push({
      id,
      label: (typeof o.label === "string" ? o.label : "").slice(0, 40) || "Logo",
      url,
      mime: typeof o.mime === "string" ? o.mime.slice(0, 60) : undefined,
    });
  }
  return out;
}

/** Legacy brand blob (pre-token model) — colours we migrate into tokens once. */
interface LegacyBrand {
  primary?: string; secondary?: string; neutral?: string;
  overrides?: { light?: unknown; dark?: unknown };
}

/** Migrate a pre-token kit: bake its brand colour into the token maps once. */
function migrateLegacy(parsed: LegacyBrand): ThemeMaps {
  // An Advanced-era kit already carried per-token overrides — those become the
  // theme directly. Otherwise generate a palette from the legacy brand colour so
  // the tenant's look is preserved.
  const light = cleanTokenMap(parsed.overrides?.light);
  const dark = cleanTokenMap(parsed.overrides?.dark);
  const isDefaultColour = (parsed.primary ?? "#6366f1").toLowerCase() === "#6366f1" && (parsed.secondary ?? "#f59e0b").toLowerCase() === "#f59e0b" && (parsed.neutral ?? "brand") === "brand";
  if (isDefaultColour) return { light, dark };
  const gen = deriveTokens({ primary: parsed.primary || "#6366f1", secondary: parsed.secondary, neutral: parsed.neutral });
  // Explicit overrides still win over the generated palette.
  return { light: { ...gen.light, ...light }, dark: { ...gen.dark, ...dark } };
}

/**
 * The brand kit is a PER-TENANT setting, so it's keyed by tenant in the global
 * app_config table (`brand.json:<tenantId>`). Passing the tenant is required —
 * an un-keyed blob would be shared by every tenant (the branding-leak bug).
 */
const LEGACY_BRAND_KEY = "brand.json";
export const brandKey = (tenantId: string): string => `${LEGACY_BRAND_KEY}:${tenantId}`;

export async function getBranding(db: D1Database, tenantId: string): Promise<Branding> {
  let raw = await getConfigValue(db, brandKey(tenantId));
  // Legacy migration: brand kits shipped before per-tenant keying lived under a
  // single global `brand.json`. Fall back to it for the demo tenant ONLY, so the
  // seeded demo keeps its look; real tenants start from their own (empty) key
  // rather than inheriting whatever another tenant last wrote to the shared blob.
  if (!raw && tenantId === DEMO_TENANT) raw = await getConfigValue(db, LEGACY_BRAND_KEY);
  if (!raw) return { ...BRAND_DEFAULTS, theme: { light: {}, dark: {} }, logos: [] };
  try {
    const parsed = JSON.parse(raw) as Partial<Branding> & LegacyBrand;
    // New model carries `theme`; a legacy blob doesn't → migrate its colours.
    const theme = parsed.theme
      ? { light: cleanTokenMap(parsed.theme.light), dark: cleanTokenMap(parsed.theme.dark) }
      : migrateLegacy(parsed);
    return {
      brandName: typeof parsed.brandName === "string" ? parsed.brandName : "",
      radius: typeof parsed.radius === "number" && isFinite(parsed.radius) ? parsed.radius : BRAND_DEFAULTS.radius,
      headingFont: typeof parsed.headingFont === "string" ? parsed.headingFont : BRAND_DEFAULTS.headingFont,
      bodyFont: typeof parsed.bodyFont === "string" ? parsed.bodyFont : BRAND_DEFAULTS.bodyFont,
      theme,
      logos: cleanLogos(parsed.logos),
    };
  } catch {
    return { ...BRAND_DEFAULTS, theme: { light: {}, dark: {} }, logos: [] };
  }
}

/** Merge + sanitize a partial update, then persist the whole blob. */
export async function setBranding(db: D1Database, tenantId: string, patch: Partial<Branding>): Promise<Branding> {
  const cur = await getBranding(db, tenantId);
  const next: Branding = { ...cur };
  if (typeof patch.brandName === "string") next.brandName = patch.brandName.slice(0, 80);
  if (typeof patch.radius === "number" && isFinite(patch.radius)) next.radius = Math.max(0, Math.min(64, Math.round(patch.radius)));
  if (typeof patch.headingFont === "string") next.headingFont = patch.headingFont.slice(0, 60);
  if (typeof patch.bodyFont === "string") next.bodyFont = patch.bodyFont.slice(0, 60);
  if (patch.theme && typeof patch.theme === "object") {
    next.theme = { light: cleanTokenMap(patch.theme.light), dark: cleanTokenMap(patch.theme.dark) };
  }
  if (patch.logos !== undefined) next.logos = cleanLogos(patch.logos);
  await setConfig(db, { [brandKey(tenantId)]: JSON.stringify(next) });
  return next;
}

/** True when the kit is untouched defaults — don't constrain the model then. */
function isDefaultKit(b: Branding): boolean {
  return !b.brandName && !b.logos.length && !Object.keys(b.theme.light).length && !Object.keys(b.theme.dark).length && b.bodyFont === "Inter" && b.headingFont === "Inter" && b.radius === 16;
}

/** The brand logos as an LLM-facing list (label → URL), for the generators. */
export function brandLogosBrief(b: Branding): string {
  if (!b.logos.length) return "";
  const lines = b.logos.map((l) => `- ${l.label}: ${l.url}`).join("\n");
  return `\n\nBrand logos are available at these exact URLs (use ONLY these URLs for the logo — no other remote image):\n${lines}`;
}

/** A palette hint appended to image-generation prompts so posters stay on-brand. */
export function brandImageHint(b: Branding): string {
  if (isDefaultKit(b)) return "";
  const t = resolveTokens(b.theme, "dark");
  return `Use a color palette built around ${t.primary} with ${t["chart-2"]} accents; clean, modern, on-brand${b.brandName ? ` for "${b.brandName}"` : ""}.`;
}

/** One-line brand brief handed to the AI so generated content is on-brand. It
 *  reads the resolved shadcn tokens — the single source of truth. */
export function brandBrief(b: Branding): string {
  if (isDefaultKit(b)) return ""; // untouched defaults → don't constrain the model
  const name = b.brandName ? `for the brand "${b.brandName}"` : "for this brand";
  const t = resolveTokens(b.theme, "dark");
  return (
    `Follow these brand guidelines ${name} (colours are CSS values): primary ${t.primary}, ` +
    `background ${t.background}, text ${t.foreground}, accent ${t["chart-2"]}, ` +
    `corner radius ${b.radius}px, heading font "${b.headingFont}", body font "${b.bodyFont}". ` +
    `Use these exact colours and fonts and keep the design consistent with them.` +
    brandLogosBrief(b)
  );
}
