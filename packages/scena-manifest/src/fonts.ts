/**
 * Bundled slide fonts (§15b). A curated, self-hosted set so AI- and hand-authored
 * slides have real typography without depending on Google Fonts at runtime —
 * screens may be offline, and the sandboxed slide iframe can't reach the network
 * freely. The woff2 files live in the player's static assets under /fonts and are
 * served with CORS, so both the player (slide iframes) and the dashboard (editor
 * preview + branding) can @font-face them from one canonical origin.
 *
 * Covers Latin display + text faces, Arabic (Cairo/Tajawal/Amiri) and Simplified
 * Chinese (Noto Sans SC) so non-Latin slides look great too.
 */

export type FontSubset = "latin" | "arabic" | "chinese-simplified";

export interface SlideFont {
  /** CSS font-family name authors reference. */
  family: string;
  /** File id (matches the Fontsource package id + our /fonts/<id>-<w>.woff2 name). */
  id: string;
  subset: FontSubset;
  weights: number[];
  /** UI grouping / hint. */
  category: "sans" | "serif" | "display" | "arabic" | "cjk";
}

export const SLIDE_FONTS: SlideFont[] = [
  // Latin — sans
  { family: "Inter", id: "inter", subset: "latin", weights: [400, 600, 800], category: "sans" },
  { family: "Poppins", id: "poppins", subset: "latin", weights: [400, 600, 700], category: "sans" },
  { family: "Montserrat", id: "montserrat", subset: "latin", weights: [400, 700, 800], category: "sans" },
  { family: "Space Grotesk", id: "space-grotesk", subset: "latin", weights: [400, 700], category: "sans" },
  { family: "Sora", id: "sora", subset: "latin", weights: [400, 700], category: "sans" },
  { family: "DM Sans", id: "dm-sans", subset: "latin", weights: [400, 700], category: "sans" },
  { family: "Manrope", id: "manrope", subset: "latin", weights: [400, 700], category: "sans" },
  { family: "Work Sans", id: "work-sans", subset: "latin", weights: [400, 700], category: "sans" },
  { family: "Outfit", id: "outfit", subset: "latin", weights: [400, 700], category: "sans" },
  // Latin — display
  { family: "Oswald", id: "oswald", subset: "latin", weights: [400, 700], category: "display" },
  { family: "Bebas Neue", id: "bebas-neue", subset: "latin", weights: [400], category: "display" },
  // Latin — serif
  { family: "Playfair Display", id: "playfair-display", subset: "latin", weights: [400, 700, 900], category: "serif" },
  { family: "Lora", id: "lora", subset: "latin", weights: [400, 700], category: "serif" },
  // Arabic
  { family: "Cairo", id: "cairo", subset: "arabic", weights: [400, 700], category: "arabic" },
  { family: "Tajawal", id: "tajawal", subset: "arabic", weights: [400, 700], category: "arabic" },
  { family: "Amiri", id: "amiri", subset: "arabic", weights: [400, 700], category: "arabic" },
];

/** Canonical CORS-enabled origin for the woff2 files (the player worker). */
export const FONT_BASE = "https://tv.4dl.app/fonts";

/** Just the family names — handed to the AI prompt + the branding font picker. */
export const FONT_FAMILIES: string[] = SLIDE_FONTS.map((f) => f.family);

/** Build the @font-face block that makes every bundled font available. Injected
 * into slide documents (player + editor preview) and the dashboard <head>. */
export function fontFaceCss(base: string = FONT_BASE): string {
  return SLIDE_FONTS.flatMap((f) =>
    f.weights.map(
      (w) =>
        `@font-face{font-family:'${f.family}';font-style:normal;font-weight:${w};font-display:swap;src:url('${base}/${f.id}-${w}.woff2') format('woff2');}`,
    ),
  ).join("");
}

/**
 * Wrap an HTML slide for rendering so it's byte-identical between the player and
 * the dashboard preview: bundled fonts available, a full-viewport reset, no
 * scroll. Handles both a bare fragment and a full document the AI may now emit
 * (fonts get injected into its <head>).
 */
export function slideDocument(html: string, base: string = FONT_BASE): string {
  const fonts = `<style>${fontFaceCss(base)}</style>`;
  const t = (html ?? "").trim();
  if (/<html[\s>]/i.test(t) || /<!doctype/i.test(t)) {
    if (/<head[\s>]/i.test(t)) return t.replace(/<head([^>]*)>/i, `<head$1>${fonts}`);
    if (/<html([^>]*)>/i.test(t)) return t.replace(/<html([^>]*)>/i, `<html$1><head>${fonts}</head>`);
    return fonts + t;
  }
  return (
    `<!doctype html><html><head><meta charset="utf-8">${fonts}` +
    `<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000}*{box-sizing:border-box}</style>` +
    `</head><body>${t}</body></html>`
  );
}
