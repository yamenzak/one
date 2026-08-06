/**
 * Brand → theme (§6). The tenant's shadcn tokens ARE the brand — this module
 * injects them as a live stylesheet so the ENTIRE dashboard (and the on-screen
 * widget theme) follows them. There is a single source of truth: the token maps.
 *
 * A brand kit stores the tokens directly (light + dark), a corner radius, and a
 * font pick. The Brand tab writes tokens via a generate-from-colour helper
 * (`deriveTokens`, shared with the server), theme presets, a pasted shadcn
 * theme, or per-token edits. Whatever isn't set falls back to the shipped
 * default theme in index.css (so a partial theme just tweaks a few tokens).
 *
 * The result is written to a single <style id="scena-brand"> whose rules win
 * over index.css, so the light/dark toggle keeps working.
 *
 * ⚠️ THE SELECTORS FOLLOW THE PLATFORM'S DARK-FIRST TOKENS, and getting this
 * wrong is silent. It emitted `:root { …light… }` and `.dark { …dark… }`, which
 * was correct while Scena was light-first with a `.dark` CLASS. Stage 7a moved
 * the palette to `@4dl/ui`'s dark-first tokens under a `data-theme` ATTRIBUTE,
 * and nothing has carried a `.dark` class since — so a tenant's DARK tokens
 * stopped applying entirely, and their LIGHT tokens were injected at `:root`,
 * which is the DARK theme. A brand kit rendered light-on-light in the default
 * theme and shipped that way, because both halves still compiled and the app
 * still had colours; they were just the wrong ones.
 *
 * So: dark tokens go on `:root` (dark is the ABSENCE of the attribute), light
 * tokens on `:root[data-theme="light"]`. The light block's higher specificity
 * is what makes it win in light mode even though both selectors match there.
 */

import { widgetTokens, widgetTokensCss, deriveTokens, THEME_TOKENS, type ThemeMaps } from "@scena/manifest";

export { deriveTokens, THEME_TOKENS, type ThemeMaps };

export interface BrandKit {
  brandName?: string;
  radius: number;
  bodyFont: string;
  headingFont?: string;
  /** The shadcn design tokens (light + dark) — the single source of truth. */
  theme: ThemeMaps;
}

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/* -------------------------------- injection ------------------------------- */

const STYLE_ID = "scena-brand";

function blockFor(selector: string, tokens: Record<string, string>, extra: string[] = []): string {
  const lines = Object.entries(tokens).map(([k, v]) => `  --${k}: ${v};`).concat(extra);
  if (!lines.length) return "";
  return `${selector} {\n${lines.join("\n")}\n}`;
}

/** Is this kit the untouched default? Then rely on index.css (no injection). */
export function isDefaultBrand(brand: BrandKit): boolean {
  const light = brand.theme?.light ?? {};
  const dark = brand.theme?.dark ?? {};
  return (
    !Object.keys(light).length && !Object.keys(dark).length &&
    (brand.radius ?? 16) === 16 &&
    (brand.bodyFont || "Inter") === "Inter"
  );
}

/** Build the full CSS the brand injects (exposed for tests / preview). */
export function brandCss(brand: BrandKit): string {
  const rootExtra = [`  --radius: ${clamp(brand.radius ?? 16, 0, 64)}px;`];
  if (brand.bodyFont) rootExtra.push(`  --font-sans: "${brand.bodyFont}", system-ui, sans-serif;`);
  // The radius and font are theme-independent, so they ride the `:root` block —
  // which now carries the DARK tokens. A kit with no dark tokens at all still
  // gets its radius and font, because `blockFor` only bails when the whole
  // block would be empty.
  const dark = blockFor(":root", brand.theme?.dark ?? {}, rootExtra);
  const root = blockFor(':root[data-theme="light"]', brand.theme?.light ?? {});
  // The widget `--w-*` tokens, derived from the same tokens, so the builder
  // canvas preview matches on-screen rendering.
  const widget = widgetTokensCss(widgetTokens({ theme: brand.theme, radius: brand.radius, bodyFont: brand.bodyFont }));
  return [dark, root, widget].filter(Boolean).join("\n");
}

/** Inject (or refresh) the brand stylesheet. Default kit ⇒ remove it. */
export function applyBrandTheme(brand: BrandKit): void {
  if (typeof document === "undefined") return;
  if (isDefaultBrand(brand)) return clearBrandTheme();
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = brandCss(brand);
}

/** Remove the brand stylesheet (fall back to the shipped default theme). */
export function clearBrandTheme(): void {
  if (typeof document === "undefined") return;
  document.getElementById(STYLE_ID)?.remove();
}

/* ---------------------------- paste-a-theme parse ------------------------- */

/**
 * Parse a pasted shadcn theme (CSS with `:root { --token: … }` and
 * `.dark { … }` blocks) into token maps. Unknown tokens are ignored.
 *
 * The INPUT selectors stay shadcn's, deliberately: this reads themes people
 * copy off the internet, and every one of them is written light-first with a
 * `.dark` class. What Scena EMITS is a separate decision, made in `brandCss`.
 */
export function parseThemeCss(css: string): ThemeMaps {
  const allow = new Set<string>(THEME_TOKENS);
  const grab = (re: RegExp): Record<string, string> => {
    const block = re.exec(css)?.[1] ?? "";
    const out: Record<string, string> = {};
    for (const m of block.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
      const name = m[1]!.trim();
      if (allow.has(name)) out[name] = m[2]!.trim();
    }
    return out;
  };
  return {
    light: grab(/:root\s*\{([^}]*)\}/i),
    dark: grab(/\.dark\s*\{([^}]*)\}/i),
  };
}
