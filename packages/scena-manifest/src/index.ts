/**
 * @scena/manifest — the compiled playout artifact: schema, validation,
 * canonical hashing, and the bridge to the timeline engine.
 */

export * from "./schema.js";
export { canonicalize, contentHash, hashCanonical, hashManifest } from "./hash.js";
export { SLIDE_FONTS, FONT_FAMILIES, FONT_BASE, fontFaceCss, slideDocument, type SlideFont, type FontSubset } from "./fonts.js";
export {
  widgetThemeCss, widgetTokens, widgetTokensCss, DEFAULT_WIDGET_TOKENS, WIDGET_TOKENS,
  hexToOklch, parseColor, ok, deriveTokens, resolveTokens, DEFAULT_TOKENS, THEME_TOKENS,
  type ThemeMaps, type BrandKit, type Oklch,
} from "./theme.js";
export {
  slideTimeline,
  musicTimeline,
  resolveSlideDurationMs,
} from "./timeline-adapter.js";
export {
  FEATURE_CATALOG, QUOTA_CATALOG, FEATURE_CATEGORIES,
  featureDef, quotaDef, featureMeta, quotaMeta, humanizeKey,
  type FeatureDef, type QuotaDef, type FeatureKind,
} from "./entitlements-catalog.js";
