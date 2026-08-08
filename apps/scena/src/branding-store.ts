/**
 * Brand kit (§6) — the workspace's design tokens, shape, typography and marks.
 *
 * ── WRITTEN AS IF SCENA WERE BORN ON THE PLATFORM ───────────────────────────
 *
 * Two things about this module used to be Scena's alone, and both were the same
 * mistake: a product solving a problem the platform had already solved, in a
 * shape nothing else could read.
 *
 *  1. THE SHAPE. The kit stored bare token names (`primary`) in a field called
 *     `theme`, with a radius in PIXELS. `@4dl/ui`'s `Branding` — the shape Kova
 *     and Tessa store, the shape `applyBranding` consumes, and the shape the
 *     shared `BrandingEditor` writes — stores PREFIXED names (`--primary`) in a
 *     field called `tokens`, with a radius in REM. One of them had to give, and
 *     it was never going to be the one three apps share. `migrate()` below
 *     converts an old blob on read, so nothing has to be republished.
 *
 *  2. THE PLACE. The kit lived in `app_config` under `brand.json:<tenantId>` —
 *     a global key-value table with the tenant id glued onto the key, which is
 *     how it once leaked between tenants (an un-keyed blob every workspace
 *     shared). `@4dl/tenancy` already owns `tenant_settings.branding_json`, and
 *     `/api/host` already SHIPS that column to the pre-auth client. Moving the
 *     kit there is not tidiness: it is what makes a workspace's brand arrive
 *     before the first paint instead of one authenticated round trip later,
 *     which is the flash of default violet every Scena operator sees today.
 *
 * What stays Scena's: the FONT pair and the LOGO VARIANT LIST. Fonts are picked
 * from a prepackaged set the player can serve offline, and the variants feed the
 * Company-logo widget and the AI generators — neither is a platform concern.
 */
import { DEMO_TENANT } from "./db.js";
import { getConfigValue } from "./billing-store.js";
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

/**
 * ⚠️ THESE THREE UNIONS MIRROR `@4dl/ui` BY HAND.
 *
 * A Hono worker has no business importing a React design system, so the
 * enumerations are restated here. Getting one wrong does not fail to compile —
 * it 400s a save the editor believed was valid, which is a bug that only shows
 * up in the browser. The source is `packages/ui/src/lib/theme.ts`; if you change
 * one there, change it here in the same commit.
 */
type ShadowPreset = "none" | "subtle" | "soft" | "dramatic";
type NeutralTint = "brand" | "gray" | "cool" | "warm";
type ThemeMode = "dark" | "light";

/**
 * The stored kit.
 *
 * The first block is `@4dl/ui`'s `Branding`, field for field — the editor writes
 * it and `applyBranding` reads it. The second block is Scena's own.
 */
export interface Branding {
  /* ── the platform's half ── */
  /** `@4dl/ui` `BrandTokens`: keys carry the `--` prefix. */
  tokens: { light: Record<string, string>; dark: Record<string, string> };
  /** Corner radius in REM (0.4–1.4), not pixels. */
  radius: number;
  shadow: ShadowPreset;
  borderColor: string | null;
  borderWidth: number;
  neutral: NeutralTint;
  defaultMode: ThemeMode | null;
  logoUrl: string | null;
  iconUrl: string | null;
  logoUrlLight: string | null;
  iconUrlLight: string | null;

  /* ── Scena's own half ── */
  brandName: string;
  headingFont: string;
  bodyFont: string;
  /** Logo variants for the Company-logo widget and the AI generators. */
  logos: BrandLogo[];
}

export const BRAND_DEFAULTS: Branding = {
  tokens: { light: {}, dark: {} },
  radius: 1,
  shadow: "soft",
  borderColor: null,
  borderWidth: 1,
  neutral: "brand",
  defaultMode: null,
  logoUrl: null,
  iconUrl: null,
  logoUrlLight: null,
  iconUrlLight: null,
  brandName: "",
  headingFont: "Inter",
  bodyFont: "Inter",
  logos: [],
};

const TOKENS = new Set<string>(THEME_TOKENS);

/** Drop a leading `--` so a bare and a prefixed key answer the same question. */
const bare = (k: string): string => (k.startsWith("--") ? k.slice(2) : k);

/**
 * Keep only allowlisted token → sane colour-string entries, keyed the PLATFORM's
 * way (`--primary`).
 *
 * It accepts both conventions on the way in — the old editor wrote bare names,
 * an imported theme may carry either — and normalises on the way out, so the
 * stored blob has exactly one shape whatever wrote it.
 */
function cleanTokenMap(m: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (m && typeof m === "object") {
    for (const [k, v] of Object.entries(m as Record<string, unknown>)) {
      const name = bare(k);
      if (TOKENS.has(name) && typeof v === "string" && v.trim() && v.length <= 64 && !/[;{}<>]/.test(v)) out[`--${name}`] = v.trim();
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

/** A URL a mark may live at — same rules as a logo variant's. */
const cleanUrl = (v: unknown): string | null =>
  typeof v === "string" && v.trim() && v.length <= 512 && !/[<>"]/.test(v) ? v.trim() : null;

/** A single CSS colour, bound by the same rules as one inside a token map. */
const cleanColor = (v: unknown): string | null =>
  typeof v === "string" && v.trim() && v.length <= 64 && !/[;{}<>]/.test(v) ? v.trim() : null;

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

/**
 * A font family name, allowlisted rather than escaped.
 *
 * It reaches a CSS rule twice — `--font-sans` in the dashboard and `--w-font`
 * inside `manifest.theme`, which the player injects verbatim into a bare
 * document on a television. A name carrying `;` or `}` closes the declaration
 * and then the block. Letters, digits, spaces, hyphens and dots are every
 * character a real family needs; the picker only offers names from a fixed
 * list, so anything else is a bug or an attack and falls back to the default.
 *
 * The renderer allowlists too (`@scena/manifest` widgetTokens, `brandExtrasCss`)
 * — deliberately, in both places. This one keeps it out of the database; those
 * keep it off the page whatever is already in there.
 */
const cleanFont = (v: unknown, fallback: string): string =>
  typeof v === "string" && /^[\w \-.]{1,60}$/.test(v) ? v : fallback;

/**
 * A radius, in rem, from whatever a stored blob holds.
 *
 * ⚠️ THE UNIT CHANGED, and the discriminator is the value itself. Scena stored
 * PIXELS (0–64, shipped default 16); the platform stores REM (0.4–1.4). No
 * legitimate rem value is above 4 and no legitimate pixel value is below 4, so
 * "greater than 4 means pixels" separates them with room to spare — and getting
 * it wrong is loud rather than silent (a 16rem corner radius turns every card
 * into a circle), which is why this is a conversion and not a guess.
 */
function remRadius(v: unknown): number {
  if (typeof v !== "number" || !isFinite(v)) return BRAND_DEFAULTS.radius;
  const rem = v > 4 ? v / 16 : v;
  return Math.max(0.4, Math.min(1.4, Math.round(rem * 100) / 100));
}

/** Legacy brand blob (pre-token model) — colours we migrate into tokens once. */
interface LegacyBrand {
  primary?: string; secondary?: string; neutral?: string;
  theme?: { light?: unknown; dark?: unknown };
  overrides?: { light?: unknown; dark?: unknown };
}

/**
 * Bring any stored blob — pre-token, pre-platform, or current — up to `Branding`.
 *
 * Three generations are in play and all three are cheap to read: an
 * Advanced-era kit carried per-token `overrides`, a token-era kit carried
 * `theme` with bare keys and a pixel radius, and the current one carries
 * `tokens`. `cleanTokenMap` normalises the keys of all three, so the only thing
 * this has to decide is WHICH FIELD to read.
 */
function migrate(parsed: Partial<Branding> & LegacyBrand): Branding {
  let tokens: { light: Record<string, string>; dark: Record<string, string> };
  if (parsed.tokens) {
    tokens = { light: cleanTokenMap(parsed.tokens.light), dark: cleanTokenMap(parsed.tokens.dark) };
  } else if (parsed.theme) {
    tokens = { light: cleanTokenMap(parsed.theme.light), dark: cleanTokenMap(parsed.theme.dark) };
  } else {
    // Pre-token: bake the legacy brand colour into a palette so the workspace
    // keeps its look, with any explicit per-token override still winning.
    const light = cleanTokenMap(parsed.overrides?.light);
    const dark = cleanTokenMap(parsed.overrides?.dark);
    const untouched =
      (parsed.primary ?? "#6366f1").toLowerCase() === "#6366f1" &&
      (parsed.secondary ?? "#f59e0b").toLowerCase() === "#f59e0b" &&
      (parsed.neutral ?? "brand") === "brand";
    if (untouched) tokens = { light, dark };
    else {
      const gen = deriveTokens({ primary: parsed.primary || "#6366f1", secondary: parsed.secondary, neutral: parsed.neutral });
      tokens = { light: { ...cleanTokenMap(gen.light), ...light }, dark: { ...cleanTokenMap(gen.dark), ...dark } };
    }
  }
  return {
    tokens,
    radius: remRadius(parsed.radius),
    shadow: oneOf(parsed.shadow, ["none", "subtle", "soft", "dramatic"] as const, BRAND_DEFAULTS.shadow),
    borderColor: cleanColor(parsed.borderColor),
    borderWidth:
      typeof parsed.borderWidth === "number" && isFinite(parsed.borderWidth) ? Math.max(0, Math.min(4, parsed.borderWidth)) : BRAND_DEFAULTS.borderWidth,
    neutral: oneOf(parsed.neutral, ["brand", "gray", "cool", "warm"] as const, BRAND_DEFAULTS.neutral),
    defaultMode: parsed.defaultMode === "light" || parsed.defaultMode === "dark" ? parsed.defaultMode : null,
    logoUrl: cleanUrl(parsed.logoUrl),
    iconUrl: cleanUrl(parsed.iconUrl),
    logoUrlLight: cleanUrl(parsed.logoUrlLight),
    iconUrlLight: cleanUrl(parsed.iconUrlLight),
    brandName: typeof parsed.brandName === "string" ? parsed.brandName.slice(0, 80) : "",
    headingFont: cleanFont(parsed.headingFont, BRAND_DEFAULTS.headingFont),
    bodyFont: cleanFont(parsed.bodyFont, BRAND_DEFAULTS.bodyFont),
    logos: cleanLogos(parsed.logos),
  };
}

/** The pre-platform home. Read-only now — `setBranding` never writes here. */
const LEGACY_BRAND_KEY = "brand.json";
export const brandKey = (tenantId: string): string => `${LEGACY_BRAND_KEY}:${tenantId}`;

export async function getBranding(db: D1Database, tenantId: string): Promise<Branding> {
  const row = await db
    .prepare("SELECT branding_json FROM tenant_settings WHERE tenant_id = ?")
    .bind(tenantId)
    .first<{ branding_json: string | null }>();
  let raw = row?.branding_json ?? null;
  /*
    The two pre-platform homes, in the order they existed. Neither is written
    any more; a workspace that still has one is upgraded the first time it saves.

    The un-keyed `brand.json` is served to the DEMO tenant only — it was once
    shared by every workspace, which is the branding-leak bug, and falling back
    to it for a real tenant would hand them whatever another tenant last wrote.
  */
  if (!raw) raw = await getConfigValue(db, brandKey(tenantId));
  if (!raw && tenantId === DEMO_TENANT) raw = await getConfigValue(db, LEGACY_BRAND_KEY);
  if (!raw) return structuredClone(BRAND_DEFAULTS);
  try {
    return migrate(JSON.parse(raw) as Partial<Branding> & LegacyBrand);
  } catch {
    return structuredClone(BRAND_DEFAULTS);
  }
}

/** Merge + sanitize a partial update, then persist the whole blob. */
export async function setBranding(db: D1Database, tenantId: string, patch: Partial<Branding>): Promise<Branding> {
  const cur = await getBranding(db, tenantId);
  // `migrate` is the one sanitizer, so a patch goes through exactly the same
  // clamps a stored blob does — there is no second set of rules to drift.
  const next = migrate({ ...cur, ...patch } as Partial<Branding> & LegacyBrand);
  const now = new Date().toISOString();
  const json = JSON.stringify(next);
  await db
    .prepare(
      "INSERT INTO tenant_settings (tenant_id, branding_json, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(tenant_id) DO UPDATE SET branding_json = ?, updated_at = ?",
    )
    .bind(tenantId, json, now, json, now)
    .run();
  return next;
}

/**
 * The kit as `@scena/manifest` wants it: bare-keyed token maps and a PIXEL
 * radius, because `--w-radius` lands on a television that has no root font size
 * to resolve a rem against.
 *
 * One adapter, at the boundary, rather than a second radius field — the widget
 * corner and the UI corner are the same decision expressed in two units, and
 * storing both is how they come to disagree.
 */
export function manifestBrand(b: Branding): { theme: ThemeMaps; radius: number; bodyFont: string } {
  return { theme: b.tokens, radius: Math.round(b.radius * 16), bodyFont: b.bodyFont };
}

/** True when the kit is untouched defaults — don't constrain the model then. */
function isDefaultKit(b: Branding): boolean {
  return (
    !b.brandName && !b.logos.length &&
    !Object.keys(b.tokens.light).length && !Object.keys(b.tokens.dark).length &&
    b.bodyFont === "Inter" && b.headingFont === "Inter"
  );
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
  const t = resolveTokens(b.tokens, "dark");
  return `Use a color palette built around ${t.primary} with ${t["chart-2"]} accents; clean, modern, on-brand${b.brandName ? ` for "${b.brandName}"` : ""}.`;
}

/** One-line brand brief handed to the AI so generated content is on-brand. It
 *  reads the resolved shadcn tokens — the single source of truth. */
export function brandBrief(b: Branding): string {
  if (isDefaultKit(b)) return ""; // untouched defaults → don't constrain the model
  const name = b.brandName ? `for the brand "${b.brandName}"` : "for this brand";
  const t = resolveTokens(b.tokens, "dark");
  return (
    `Follow these brand guidelines ${name} (colours are CSS values): primary ${t.primary}, ` +
    `background ${t.background}, text ${t.foreground}, accent ${t["chart-2"]}, ` +
    `corner radius ${Math.round(b.radius * 16)}px, heading font "${b.headingFont}", body font "${b.bodyFont}". ` +
    `Use these exact colours and fonts and keep the design consistent with them.` +
    brandLogosBrief(b)
  );
}
