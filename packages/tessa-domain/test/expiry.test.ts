/**
 * Expiry composition — the rule where being wrong reaches a patient.
 *
 * Two failure directions, and they are not symmetric:
 *
 *   TOO LATE  showing the printed date on an opened vial. The item looks usable
 *             and is not. This is the one that hurts someone.
 *   TOO EARLY treating a missing input as an elapsed clock. Nothing is unsafe,
 *             but the whole stock room reads as expired and staff learn to
 *             ignore the warning — which eventually produces the first failure.
 *
 * Both are tested, and the boundary (expiry day is still usable) is pinned
 * exactly, because an off-by-one there is invisible in every normal case.
 */

import { describe, expect, it } from "vitest";
import { daysUntilExpiry, effectiveExpiry, expiryStatus, isUsable } from "../src/index.js";

describe("which clock wins", () => {
  it("uses the printed date when it is the only one running", () => {
    expect(effectiveExpiry({ printed: "2027-01-31" })).toMatchObject({
      at: "2027-01-31",
      reason: "printed",
    });
  });

  it("lets an opened vial expire BEFORE its printed date", () => {
    // The headline case. Printed 2027, unusable 28 days after opening — a system
    // showing 2027 here is confidently wrong at the moment of use.
    const r = effectiveExpiry({ printed: "2027-01-31", openedAt: "2026-01-02", postOpeningDays: 28 });
    expect(r).toMatchObject({ at: "2026-01-30", reason: "opened" });
  });

  it("keeps the printed date when opening does not shorten it enough", () => {
    // The other direction: a post-opening rule must not shorten something whose
    // printed date is already sooner.
    const r = effectiveExpiry({ printed: "2026-02-01", openedAt: "2026-01-02", postOpeningDays: 90 });
    expect(r).toMatchObject({ at: "2026-02-01", reason: "printed" });
  });

  it("expires a sterilised pack on its sterile shelf life", () => {
    const r = effectiveExpiry({ sterilisedAt: "2026-07-01", sterileShelfDays: 180 });
    expect(r).toMatchObject({ at: "2026-12-28", reason: "sterile" });
  });

  it("takes the earliest when all three are running", () => {
    const r = effectiveExpiry({
      printed: "2030-01-01",
      openedAt: "2026-06-01",
      postOpeningDays: 28,
      sterilisedAt: "2026-01-01",
      sterileShelfDays: 90,
    });
    expect(r).toMatchObject({ at: "2026-04-01", reason: "sterile" });
    // Every running clock is reported, earliest first, so a UI can show its
    // working rather than asserting a date the holder cannot check.
    expect(r.clocks.map((c) => c.reason)).toEqual(["sterile", "opened", "printed"]);
  });
});

describe("a missing input is a clock that is NOT running", () => {
  // This block is the "too early" failure. Each of these, read as an elapsed
  // clock, would mark healthy stock expired.

  it("never expires when nothing is known", () => {
    expect(effectiveExpiry({})).toEqual({ at: null, reason: null, clocks: [] });
  });

  it("ignores a post-opening rule on an UNOPENED item", () => {
    const r = effectiveExpiry({ printed: "2027-01-31", postOpeningDays: 28 });
    expect(r).toMatchObject({ at: "2027-01-31", reason: "printed" });
  });

  it("ignores an opening date when the item has no post-opening rule", () => {
    // Most things do not shorten on opening. Treating `openedAt` alone as a
    // clock would expire a box of gauze the day it was unwrapped.
    const r = effectiveExpiry({ printed: "2027-01-31", openedAt: "2026-01-02" });
    expect(r).toMatchObject({ at: "2027-01-31", reason: "printed" });
  });

  it("ignores zero and negative day counts", () => {
    expect(effectiveExpiry({ openedAt: "2026-01-02", postOpeningDays: 0 }).at).toBeNull();
    expect(effectiveExpiry({ sterilisedAt: "2026-01-02", sterileShelfDays: -5 }).at).toBeNull();
  });

  it("ignores a malformed date instead of computing from NaN", () => {
    // A garbage date must not become epoch, which would read as expired in 1970.
    expect(effectiveExpiry({ printed: "31/01/2027" }).at).toBeNull();
    expect(effectiveExpiry({ printed: "" }).at).toBeNull();
    expect(effectiveExpiry({ printed: null }).at).toBeNull();
  });
});

describe("the status boundary", () => {
  // Expiry day is USABLE. A day early throws away stock across the whole
  // building; a day late hands out lapsed stock. Neither is acceptable, and
  // neither is visible in a test that only checks the obvious cases.

  it("is still usable ON the expiry day", () => {
    expect(expiryStatus("2026-08-01", "2026-08-01")).not.toBe("expired");
    expect(isUsable("2026-08-01", "2026-08-01")).toBe(true);
  });

  it("is expired the day after", () => {
    expect(expiryStatus("2026-08-01", "2026-08-02")).toBe("expired");
    expect(isUsable("2026-08-01", "2026-08-02")).toBe(false);
  });

  it("warns inside the window and not outside it", () => {
    expect(expiryStatus("2026-08-30", "2026-08-01", 30)).toBe("soon");
    expect(expiryStatus("2026-09-01", "2026-08-01", 30)).toBe("ok");
  });

  it("takes the warning window from the caller", () => {
    // A month's notice is right for a reorder and useless on a tray being opened
    // now, so urgency cannot be a constant.
    expect(expiryStatus("2026-08-10", "2026-08-01", 3)).toBe("ok");
    expect(expiryStatus("2026-08-10", "2026-08-01", 30)).toBe("soon");
  });

  it("reports `none` rather than a guess when there is no expiry", () => {
    expect(expiryStatus(null, "2026-08-01")).toBe("none");
    // …and `none` is usable: a thing with no expiry has not expired.
    expect(isUsable(null, "2026-08-01")).toBe(true);
  });
});

describe("days remaining", () => {
  it("counts forward", () => {
    expect(daysUntilExpiry("2026-08-31", "2026-08-01")).toBe(30);
  });

  it("goes NEGATIVE once lapsed, rather than clamping at zero", () => {
    // "Expired 3 days ago" is the number an auditor asks for; clamping loses it.
    expect(daysUntilExpiry("2026-07-29", "2026-08-01")).toBe(-3);
  });

  it("is zero on the day itself", () => {
    expect(daysUntilExpiry("2026-08-01", "2026-08-01")).toBe(0);
  });

  it("survives a DST transition without drifting", () => {
    // Everything is computed in UTC precisely so a European clinic in March does
    // not see an expiry move by a day. This spans the EU DST change.
    expect(daysUntilExpiry("2027-04-01", "2027-03-01")).toBe(31);
  });

  it("is null when there is nothing to count to", () => {
    expect(daysUntilExpiry(null, "2026-08-01")).toBeNull();
  });
});

describe("the whole chain, as the app will use it", () => {
  it("a vial opened last month reads as expired even though the box says 2027", () => {
    // End to end, and the single scenario this module exists for.
    const eff = effectiveExpiry({ printed: "2027-01-31", openedAt: "2026-06-15", postOpeningDays: 28 });
    expect(eff.at).toBe("2026-07-13");
    expect(eff.reason).toBe("opened");
    expect(isUsable(eff.at, "2026-08-01")).toBe(false);
    expect(daysUntilExpiry(eff.at, "2026-08-01")).toBe(-19);
  });
});
