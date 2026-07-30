import { describe, expect, it } from "vitest";
import { findBoundaryViolations, formatViolations, violationKeys } from "@4dl/core/boundary";

/**
 * ONE MODULE LEFT, and no debt.
 *
 * `hosts`/`dcv`/`standing` went to `@4dl/tenancy` (Stage 1), `credits` to
 * `@4dl/billing` (Stage 3), `promo` to `@4dl/commerce` (Stage 4). Only `ai-mock`
 * remains; it goes to `@4dl/ai` in Stage 5 and this package is then DELETED.
 *
 * The empty list below was earned by the third test in this file. `promo.ts`
 * carried an exemption, and when the file moved out the exemption stayed —
 * "keeps the frozen list honest" failed on the next run, which is exactly what a
 * ratchet is for: a stale entry is a lie that quietly widens the check.
 */
const ALLOW: readonly string[] = [];

const dir = new URL("..", import.meta.url).pathname;

describe("package boundary", () => {
  it("imports nothing from an app", () => {
    // No allowance here, ever. A shared package that imports an app's package is
    // not shared — it is that app's, wearing a different name.
    const v = findBoundaryViolations({ dir }).filter((x) => x.kind === "app-import");
    expect(v, `\n${formatViolations(v)}`).toHaveLength(0);
  });

  it("acquires no NEW product vocabulary", () => {
    const v = findBoundaryViolations({ dir, allow: ALLOW });
    expect(v, `\n${formatViolations(v)}`).toHaveLength(0);
  });

  it("keeps the frozen list honest", () => {
    // A ratchet only works if it cannot silently loosen: an entry that no longer
    // corresponds to a real violation has to go, or the list becomes a blanket
    // exemption nobody reads.
    const all = violationKeys(findBoundaryViolations({ dir }));
    expect(ALLOW.filter((a) => !all.includes(a))).toEqual([]);
  });
});
