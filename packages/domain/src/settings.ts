/**
 * Settings registry (SPEC §8.10) — the catalogue of configurable SURFACES and
 * what gates each one. The studio-settings screen has grown many sections; this
 * is the single list of them, each with its scope and the platform entitlement
 * it requires, so the UI renders the right tabs from one place and a section's
 * visibility can't drift from what the tenant actually bought.
 *
 * The registry owns metadata only (key, label, scope, gate); the app maps each
 * key to its editor component — the same registry↔UI split the feature spine and
 * metric coding use.
 */

import type { Entitlements } from "./entitlements.js";

export interface SettingsSectionMeta {
  /** Stable section id (the UI maps it to an editor component). */
  key: string;
  /** Tab label. */
  label: string;
  /** Whose settings these are: the studio (owner-only) or the personal account. */
  scope: "studio" | "account";
  /** Platform entitlement required to show/use the section (absent ⇒ every plan). */
  requiresFeature?: keyof Entitlements["features"];
}

/** The studio (owner) settings sections, in display order. */
export const STUDIO_SETTINGS_SECTIONS: SettingsSectionMeta[] = [
  { key: "brand", label: "Brand", scope: "studio", requiresFeature: "branding" },
  { key: "signin", label: "Sign-in", scope: "studio" },
  { key: "ai", label: "AI", scope: "studio", requiresFeature: "aiSuite" },
  { key: "messaging", label: "Messaging", scope: "studio" },
  { key: "marketplace", label: "Marketplace", scope: "studio" },
  // "Integrations" is the food/exercise DATA-PROVIDER surface (USDA, Nutritionix,
  // FatSecret, ExerciseDB keys) — i.e. the `externalSearch` entitlement. It is NOT
  // the reserved `integrations` feature (tenant API / webhooks / exports), which
  // does not exist and must never get a settings tab. Gating it here keeps the tab
  // consistent with the 403 `/foods/search-external` already returns.
  { key: "integrations", label: "Integrations", scope: "studio", requiresFeature: "externalSearch" },
  // Closing the studio is irreversible, so it gets its own destination rather
  // than sitting under whichever tab an owner happened to be reading. Last in
  // the row, and never the default.
  { key: "danger", label: "Danger zone", scope: "studio" },
];

/**
 * Whether a settings section is visible, given the tenant's entitlements. A
 * section with no `requiresFeature` is always visible; otherwise it shows only
 * when the tenant holds the feature. (Owner-only gating is applied by the caller,
 * which knows the role.)
 */
export function settingsSectionVisible(
  section: SettingsSectionMeta,
  features: Entitlements["features"],
): boolean {
  return !section.requiresFeature || features[section.requiresFeature];
}
