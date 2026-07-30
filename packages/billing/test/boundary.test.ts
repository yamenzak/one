import { describe, expect, it } from "vitest";
import { findBoundaryViolations, formatViolations, violationKeys } from "@4dl/core/boundary";

/**
 * CLEAN — and the last thing to leave was live data.
 *
 * `stripe.ts` hard-coded `metadata[kova_tenant]` on every customer, checkout
 * session and subscription, and `Kova <plan>` as the product name a buyer sees
 * on their receipt. The first of those is not a string, it is a JOIN KEY: the
 * webhook handlers read it back to decide which tenant a payment belongs to.
 *
 * So it became `StripeBranding`, and Kova passes `metadataPrefix: "kova"` — the
 * live values are byte-identical, and a second app cannot inherit them by
 * accident. Changing that prefix on a deployment with existing customers would
 * orphan every one: events still arrive, the lookup finds nothing, and payments
 * succeed while nothing is activated.
 */
const ALLOW: readonly string[] = [];

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
