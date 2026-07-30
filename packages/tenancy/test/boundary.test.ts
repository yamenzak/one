import { describe, expect, it } from "vitest";
import { findBoundaryViolations, formatViolations, violationKeys } from "@4dl/core/boundary";

/**
 * CLEAN. Zero entries, and that is the point of this file.
 *
 * `@4dl/tenancy` was carved out of `@4dl/platform`, which named a tenant a
 * "studio" in its own TYPE names — `StudioStanding`, `studioStandingOf`,
 * `StandingFacts.studio` — and hard-coded the first app's brand into a security
 * control (`RESERVED_LABELS`). Type names are the worst place for product
 * vocabulary: every consuming app is forced to adopt the word.
 *
 * The rename rode along with the move, so this package starts at zero. An empty
 * ALLOW list is a load-bearing assertion, not a placeholder — the next leak fails
 * the build instead of quietly joining a list.
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
