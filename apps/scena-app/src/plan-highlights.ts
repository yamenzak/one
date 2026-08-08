/**
 * "What you get", from a plan's entitlements blob — ONE derivation, two screens.
 *
 * Billing had this inline and the onboarding wizard needed the same lines. Two
 * copies of "what does this plan include" is how a picker comes to promise
 * something the plan screen does not list, so it lives here and both import it.
 *
 * Derived from `@scena/manifest`'s shared catalogs rather than hand-written:
 * quotas with a `billing` formatter list their value, features with `billing`
 * copy list when enabled. Catalogue a new feature and it appears in both places
 * with no edit here.
 */

import { FEATURE_CATALOG, QUOTA_CATALOG } from "@scena/manifest";

export function planHighlights(entitlementsJson: string | null | undefined): string[] {
  let ent: { quotas?: Record<string, number>; features?: Record<string, unknown> } = {};
  try {
    ent = JSON.parse(entitlementsJson || "{}");
  } catch {
    /* A malformed blob yields no lines rather than a crashed picker. */
  }
  const q = ent.quotas ?? {};
  const f = ent.features ?? {};
  const out: string[] = [];
  // Capacity lines first (screens, team, sources, boards…) — they are what the
  // decision actually turns on.
  for (const quota of QUOTA_CATALOG) {
    if (!quota.billing) continue;
    const line = quota.billing(q[quota.key] ?? 0);
    if (line) out.push(line);
  }
  // Then feature lines, in catalog order.
  for (const feat of FEATURE_CATALOG) {
    if (!feat.billing) continue;
    /*
      `=== true`, not truthiness, and it matches how the SERVER resolves one: a
      plan blob carrying `1` or `"true"` does not enable the feature there, so
      advertising it here would promise something the gate refuses.
    */
    if (f[feat.key] === true) out.push(feat.billing);
  }
  return out;
}

/** Cents as a price a person reads. `$19`, `$19.50`. */
export const dollars = (cents: number): string => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
