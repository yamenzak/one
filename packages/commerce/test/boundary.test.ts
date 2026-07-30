import { describe, expect, it } from "vitest";
import { findBoundaryViolations, formatViolations, violationKeys } from "@4dl/core/boundary";

/**
 * ONE entry, and it is the interesting one.
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
 *   schema.ts  the SQL still says `client_id`, and stays that way. A column name
 *              is LIVE DATA: renaming it is a migration over every tenant's
 *              purchase history, for zero benefit — a second app compiles
 *              against the TypeScript, not against Kova's column labels, and
 *              that surface is clean. This is the one place the checker's
 *              answer and the right answer differ, so it is written down rather
 *              than silently excluded.
 */
const ALLOW: readonly string[] = ["src/schema.ts:client"];

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
