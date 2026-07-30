import { describe, expect, it } from "vitest";
import { findBoundaryViolations, formatViolations, violationKeys } from "@4dl/core/boundary";

/**
 * The debt this package carries today, frozen.
 *
 * Every entry is a place `@4dl/platform` names something only Kova has. None of
 * them break Kova — they would be inherited verbatim by the next app, which is a
 * different and worse problem. The list may only ever get SHORTER: remove an
 * entry in the same commit as the fix.
 *
 *   hosts.ts:kova     `RESERVED_LABELS` hard-codes the first app's own name, and
 *                     the root domain appears in a doc example. The label list is
 *                     a security control (a tenant at `admin.` is a takeover), so
 *                     it must become per-app config, not a shared constant.
 *   hosts.ts:studio   user-facing slug-validation copy ("Pick an address for your
 *                     studio."). A warehouse does not have a studio.
 *   standing.ts:studio  `StudioStanding`, `studioStandingOf`,
 *                     `studioStandingOfGate`, and the `StandingFacts.studio`
 *                     field. This is the deepest one: it is in the TYPE names, so
 *                     every consuming app inherits the word.
 *
 * All three are scheduled for Stage 1 of docs/PLATFORM-EXTRACTION.md, where these
 * files move into `@4dl/tenancy` and the rename rides along with the move rather
 * than being paid for twice.
 */
const ALLOW = [
  "src/hosts.ts:kova",
  "src/hosts.ts:studio",
  // `PromoCode.restrictedClientId` / `PromoContext.clientId` — promo math is
  // generic ("this code is reserved for one buyer"), the noun is not.
  "src/promo.ts:client",
  "src/standing.ts:studio",
];

describe("package boundary", () => {
  it("imports nothing from an app", () => {
    // No allowance here, ever. A shared package that imports @kova/* is not
    // shared — it is Kova's, wearing a different name.
    const v = findBoundaryViolations({ dir: new URL("..", import.meta.url).pathname }).filter(
      (x) => x.kind === "app-import",
    );
    expect(v, `\n${formatViolations(v)}`).toHaveLength(0);
  });

  it("acquires no NEW product vocabulary", () => {
    const v = findBoundaryViolations({ dir: new URL("..", import.meta.url).pathname, allow: ALLOW });
    expect(v, `\n${formatViolations(v)}`).toHaveLength(0);
  });

  it("keeps the frozen list honest", () => {
    // A ratchet only works if it cannot silently loosen: an entry that no longer
    // corresponds to a real violation has to be deleted, or the list slowly
    // becomes a blanket exemption nobody reads.
    const all = violationKeys(findBoundaryViolations({ dir: new URL("..", import.meta.url).pathname }));
    expect(ALLOW.filter((a) => !all.includes(a))).toEqual([]);
  });
});
