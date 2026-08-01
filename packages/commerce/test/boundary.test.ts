import { describe, expect, it } from "vitest";
import { findBoundaryViolations, formatViolations, violationKeys } from "@4dl/core/boundary";

/**
 * CLEAN — the last entry went before the first deploy.
 *
 * Three things had to change on the way in, and each was a different kind:
 *
 *   promo.ts   `restrictedClientId` → `restrictedSubjectId`, and the failure
 *              `wrong_client` → `wrong_subject`. The second is a WIRE CODE the
 *              app maps to copy, so the rename landed in two screens too.
 *   budgets.ts the scope union was `"workout" | "meal" | "all"` and the wildcard
 *              expansion hard-coded `["workout","meal"]`. The app now supplies
 *              its scopes; the arithmetic never cared what they were.
 *   lapse.ts   `LAPSE_META` — "Keeps using a client seat" — is COPY, and copy
 *              belongs to the app. The package takes a `label` resolver, so a
 *              settings screen can never inherit another product's wording.
 *
 *   schema.ts  `client_subscriptions` → `subject_subscriptions`, `client_id` →
 *              `subject_id`, `restricted_client_id` → `restricted_subject_id`.
 *              This entry was frozen with the reasoning "a column name is live
 *              data, renaming it is a migration for a cosmetic gain" — true, and
 *              true only AFTER a deploy. Kova had not deployed yet, so the
 *              window was open exactly once and the debt was paid instead of
 *              documented.
 */
/**
 * `client_reference_id` is STRIPE'S FIELD NAME, not our vocabulary.
 *
 * The boundary checker flags the substring "client", and it is right to: in this
 * package a buyer is a `subject`, never a client. But this identifier is fixed
 * by an external API — it is the URL parameter Stripe accepts and the property
 * name it sends back — so it cannot be renamed without breaking the
 * integration, and paraphrasing it in the adapter would only hide which wire
 * field is meant.
 *
 * The exemption is keyed file+token, which is the finest grain the checker
 * offers. It therefore pardons "client" in the STRIPE ADAPTER ONLY — one file
 * that exists solely to speak Stripe's wire format. Every other file in the
 * package, including providers.ts next door, still fails on it.
 */
const ALLOW: readonly string[] = ["src/providers.stripe-link.ts:client"];

const dir = new URL("..", import.meta.url).pathname;

describe("package boundary", () => {
  it("imports nothing from an app", () => {
    const v = findBoundaryViolations({ dir }).filter((x) => x.kind === "app-import");
    expect(v, `\n${formatViolations(v)}`).toHaveLength(0);
  });

  it("acquires no NEW product vocabulary", () => {
    const v = findBoundaryViolations({ dir, allow: ALLOW });
    expect(v, `\n${formatViolations(v)}`).toHaveLength(0);
  });

  it("keeps the frozen list honest", () => {
    const all = violationKeys(findBoundaryViolations({ dir }));
    expect(ALLOW.filter((a) => !all.includes(a))).toEqual([]);
  });
});
