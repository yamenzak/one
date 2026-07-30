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
  /**
   * What is INSIDE, for the settings index — a table-of-contents line, so an
   * owner can aim before tapping. Not a description of why the section exists:
   * that is what the section page's own one-liner is for.
   */
  blurb: string;
}

/** The studio (owner) settings sections, in display order. */
export const STUDIO_SETTINGS_SECTIONS: SettingsSectionMeta[] = [
  { key: "brand", label: "Brand", scope: "studio", requiresFeature: "branding", blurb: "Colour, corners, logos, your AI coach" },
  { key: "signin", label: "Sign-in", scope: "studio", blurb: "Your login link, its copy, passkeys" },
  { key: "ai", label: "AI", scope: "studio", requiresFeature: "aiSuite", blurb: "Models, cost per action, house voice" },
  { key: "messaging", label: "Email", scope: "studio", blurb: "Sender, which emails go out, templates" },
  { key: "marketplace", label: "Storefront", scope: "studio", blurb: "Public listing and client self-signup" },
  // "Integrations" is the food/exercise DATA-PROVIDER surface (USDA, Nutritionix,
  // FatSecret, ExerciseDB keys) — i.e. the `externalSearch` entitlement. It is NOT
  // the reserved `integrations` feature (tenant API / webhooks / exports), which
  // does not exist and must never get a settings tab. Gating it here keeps the tab
  // consistent with the 403 `/foods/search-external` already returns.
  { key: "integrations", label: "Food & exercise data", scope: "studio", requiresFeature: "externalSearch", blurb: "USDA, Nutritionix, FatSecret, ExerciseDB keys" },
  // Closing the studio is irreversible, so it gets its own destination rather
  // than sitting under whichever tab an owner happened to be reading. Last in
  // the row, and never the default.
  { key: "lapse", label: "When access runs out", scope: "studio", blurb: "What happens to a client whose plan expired" },
  { key: "danger", label: "Close your studio", scope: "studio", blurb: "Cancel billing and erase everything" },
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
