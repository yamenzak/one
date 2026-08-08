/**
 * Brand → theme (§6). The workspace's design tokens ARE the brand, and applying
 * them is `@4dl/ui`'s job now, not Scena's.
 *
 * ── WHAT THIS FILE STOPPED DOING ────────────────────────────────────────────
 *
 * It used to build the whole stylesheet by hand — a `:root` block, a
 * `:root[data-theme="light"]` block, the radius, the shadows — which is exactly
 * what `applyBranding` does in every other 4DL app. Two implementations of "put
 * the tenant's palette on the page" is how one of them comes to be wrong, and
 * one of them WAS: between Stage 7a and 7f this emitted `:root { …light… }` and
 * `.dark { …dark… }`, so a workspace's dark tokens applied nowhere and its light
 * tokens were injected into the dark theme. Both halves compiled, the app still
 * had colours, and they were the wrong ones.
 *
 * So the shadcn side is `applyBranding`, on the same `<style id="scena-brand">`
 * element this module has always written (`configureTheme` below), with the same
 * selectors — because the platform's are the ones Scena was converging on.
 *
 * ── WHAT IS STILL SCENA'S ───────────────────────────────────────────────────
 *
 * Two things the platform has no opinion about, in a SECOND style element:
 *
 *   `--font-sans`             — Scena picks fonts from a prepackaged set the
 *                               player can serve offline.
 *   the `--w-*` widget block  — the on-screen widget theme, derived from the
 *                               same tokens so the builder's canvas matches
 *                               what a television shows.
 *
 * They are separate rather than folded in because `applyBranding` OWNS the
 * content of its element: it rewrites `textContent` wholesale on every call, so
 * anything appended there is silently discarded on the next preview keystroke.
 */

import { applyBranding, configureTheme, type Branding } from "@4dl/ui";
import { widgetTokens, widgetTokensCss, deriveTokens, THEME_TOKENS, type ThemeMaps } from "@scena/manifest";

export { deriveTokens, THEME_TOKENS, type ThemeMaps };

/**
 * The stored kit: `@4dl/ui`'s `Branding` plus Scena's own four fields.
 *
 * Mirrors `apps/scena/src/branding-store.ts` — the server sanitizes into exactly
 * this shape, and `/api/host` ships it before the first paint.
 */
export interface WorkspaceBrand extends Branding {
  brandName: string;
  headingFont: string;
  bodyFont: string;
  logos: BrandLogoRef[];
}

/** A logo variant, for the Company-logo widget and the AI generators. */
export interface BrandLogoRef {
  id: string;
  label: string;
  url: string;
  mime?: string;
}

/** The shape a brand-less caller can still hand to `applyBrandTheme`. */
export const EMPTY_BRAND: WorkspaceBrand = {
  tokens: { light: {}, dark: {} },
  radius: 1,
  shadow: "soft",
  borderColor: null,
  borderWidth: 1,
  neutral: "brand",
  logoUrl: null,
  iconUrl: null,
  brandName: "",
  headingFont: "Inter",
  bodyFont: "Inter",
  logos: [],
};

/*
  The element `applyBranding` writes and the key the mode preference lives under.

  Both are Scena's, not the design system's, and the storage key is load-bearing:
  it is the one thing a person's light/dark choice survives a sign-out in, so
  changing it silently resets everyone's preference. `theme.tsx` reads the same
  constant — see there for why Scena keeps its own three-state (system) mode
  module rather than using the platform's two-state one.
*/
configureTheme({ styleId: "scena-brand", storageKey: "scena.theme" });

const EXTRAS_ID = "scena-brand-extras";

/**
 * `@scena/manifest` wants bare-keyed tokens and a PIXEL radius — a television
 * has no root font size to resolve a rem against. Same adapter as the server's
 * `manifestBrand`, and for the same reason: one radius, two units, converted at
 * the boundary rather than stored twice.
 */
function forManifest(brand: WorkspaceBrand): { theme: ThemeMaps; radius: number; bodyFont: string } {
  return {
    theme: { light: brand.tokens?.light ?? {}, dark: brand.tokens?.dark ?? {} },
    radius: Math.round((brand.radius ?? 1) * 16),
    bodyFont: brand.bodyFont,
  };
}

/** Scena's own half of the stylesheet: the fonts and the widget theme. */
export function brandExtrasCss(brand: WorkspaceBrand): string {
  const root: string[] = [];
  // A font name lands inside a CSS string literal, so anything that could close
  // it or the rule is dropped rather than escaped — the picker only ever offers
  // names from a fixed list, and a value that is not one of them is a bug or an
  // attack, never a preference worth honouring.
  const font = (v: string) => (/^[\w \-.]{1,60}$/.test(v) ? v : "");
  const body = font(brand.bodyFont || "");
  if (body) root.push(`  --font-sans: "${body}", system-ui, sans-serif;`);
  // `headingFont` is deliberately NOT emitted: no token in `@4dl/ui` reads it
  // and inventing one here would re-open the two-implementations problem this
  // file exists to close. It is a GENERATION input — it reaches the AI brief and
  // the slides it draws — and the editor says so rather than implying the
  // dashboard's own headings follow it.
  const widget = widgetTokensCss(widgetTokens(forManifest(brand)));
  return [root.length ? `:root {\n${root.join("\n")}\n}` : "", widget].filter(Boolean).join("\n");
}

/** Inject (or refresh) the brand — the platform's half and Scena's. */
export function applyBrandTheme(brand: WorkspaceBrand): void {
  if (typeof document === "undefined") return;
  applyBranding(brand);
  let el = document.getElementById(EXTRAS_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = EXTRAS_ID;
    document.head.appendChild(el);
  }
  el.textContent = brandExtrasCss(brand);
}

/** Remove the brand stylesheets (fall back to the shipped default theme). */
export function clearBrandTheme(): void {
  if (typeof document === "undefined") return;
  document.getElementById("scena-brand")?.remove();
  document.getElementById(EXTRAS_ID)?.remove();
}

/* ---------------------------- paste-a-theme parse ------------------------- */

/**
 * Parse a pasted shadcn theme (CSS with `:root { --token: … }` and
 * `.dark { … }` blocks) into token maps.
 *
 * Kept here rather than taken from `@4dl/ui` because the ALLOWLIST is Scena's:
 * `THEME_TOKENS` is the set `@scena/manifest` knows how to resolve and derive a
 * widget theme from, and a token outside it would be stored, never applied, and
 * silently inflate the "N tokens overridden" count.
 *
 * The INPUT selectors stay shadcn's, deliberately: this reads themes people copy
 * off the internet, and every one of them is written light-first with a `.dark`
 * class. What Scena EMITS is `@4dl/ui`'s decision now.
 *
 * The OUTPUT is keyed the platform's way (`--primary`), because that is what
 * lands in `Branding.tokens`.
 */
export function parseThemeCss(css: string): { light: Record<string, string>; dark: Record<string, string> } {
  const allow = new Set<string>(THEME_TOKENS);
  const grab = (re: RegExp): Record<string, string> => {
    const block = re.exec(css)?.[1] ?? "";
    const out: Record<string, string> = {};
    for (const m of block.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
      const name = m[1]!.trim();
      if (allow.has(name)) out[`--${name}`] = m[2]!.trim();
    }
    return out;
  };
  return {
    light: grab(/:root\s*\{([^}]*)\}/i),
    dark: grab(/\.dark\s*\{([^}]*)\}/i),
  };
}
