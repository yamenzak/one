/**
 * The event vocabulary and the quantity arithmetic.
 *
 * This is where a stock count silently goes wrong, so the tests are about the
 * REFUSALS rather than the happy path: every one of them is a case where the
 * tempting behaviour (clamp, round, allow) produces a number that looks fine and
 * is not.
 */

import { describe, expect, it } from "vitest";
import { EVENTS, eventAppliesTo, isEventName, isFinished, isFrozen, nextQuantity } from "../src/index.js";

describe("the vocabulary", () => {
  it("knows its own names", () => {
    expect(isEventName("consumed")).toBe(true);
    expect(isEventName("teleported")).toBe(false);
  });

  it("scopes each event to the kinds it means something for", () => {
    // `retired` on a lot is meaningless — a batch is consumed, not retired — and
    // accepting it would put a lot into a state nothing else understands.
    expect(eventAppliesTo("retired", "unit")).toBe(true);
    expect(eventAppliesTo("retired", "lot")).toBe(false);
    expect(eventAppliesTo("consumed", "lot")).toBe(true);
    expect(eventAppliesTo("consumed", "pack")).toBe(false);
    // `opened` applies to BOTH a lot and a pack, and means different things —
    // which is why the projection is per-kind rather than per-event.
    expect(eventAppliesTo("opened", "lot")).toBe(true);
    expect(eventAppliesTo("opened", "pack")).toBe(true);
  });

  it("marks retirement as the only one-way door", () => {
    const terminal = Object.entries(EVENTS).filter(([, s]) => s.terminal).map(([n]) => n);
    expect(terminal).toEqual(["retired"]);
  });
});

describe("quantity arithmetic", () => {
  it("adds on receive and subtracts on use", () => {
    expect(nextQuantity(0, "received", 10)).toEqual({ ok: true, next: 10 });
    expect(nextQuantity(10, "consumed", 3)).toEqual({ ok: true, next: 7 });
    expect(nextQuantity(10, "wasted", 2)).toEqual({ ok: true, next: 8 });
  });

  it("REFUSES to go negative rather than flooring at zero", () => {
    // The headline refusal. Flooring destroys the discrepancy — the one signal
    // that tells a manager the count is wrong or something walked — and leaves
    // the app and the shelf agreeing on a number that was never true.
    expect(nextQuantity(2, "consumed", 5)).toEqual({ ok: false, reason: "insufficient" });
  });

  it("allows consuming exactly what remains", () => {
    // The boundary next door to the one above: zero is fine, below zero is not.
    expect(nextQuantity(5, "consumed", 5)).toEqual({ ok: true, next: 0 });
  });

  it("refuses a zero or negative delta", () => {
    // A ledger row asserting that nothing happened is noise that looks like
    // evidence — worse than no row at all in an audit trail.
    expect(nextQuantity(5, "consumed", 0).ok).toBe(false);
    expect(nextQuantity(5, "consumed", -1)).toEqual({ ok: false, reason: "bad_delta" });
    expect(nextQuantity(5, "consumed", Number.NaN)).toEqual({ ok: false, reason: "bad_delta" });
  });

  it("refuses a fraction of a discrete item", () => {
    // Half a scalpel is not a rounding question. It means the caller has the
    // wrong item, and rounding would hide that.
    expect(nextQuantity(5, "consumed", 0.5)).toEqual({ ok: false, reason: "not_divisible" });
  });

  it("allows a fraction of a divisible one", () => {
    expect(nextQuantity(1, "consumed", 0.5, { divisible: true })).toEqual({ ok: true, next: 0.5 });
  });

  it("does not drift on repeated fractional use", () => {
    // 0.3 - 0.1 - 0.1 - 0.1 is 2.7e-17 in binary floating point, which would
    // read as "some left" forever and never let the lot close.
    let q = 0.3;
    for (let i = 0; i < 3; i++) {
      const r = nextQuantity(q, "consumed", 0.1, { divisible: true });
      expect(r.ok).toBe(true);
      if (r.ok) q = r.next;
    }
    expect(q).toBe(0);
  });

  it("reports `not_applicable` for an event that does not move a quantity", () => {
    // Calling this for `moved` is a caller bug, and a silent 0 would let it
    // through as though the move had also consumed nothing.
    expect(nextQuantity(5, "moved", 1)).toEqual({ ok: false, reason: "not_applicable" });
  });
});

describe("finished versus frozen", () => {
  it("treats a retired or consumed thing as finished", () => {
    expect(isFinished("retired")).toBe(true);
    expect(isFinished("consumed")).toBe(true);
    expect(isFinished("active")).toBe(false);
  });

  it("does NOT treat quarantine as finished", () => {
    // The distinction is the whole recall story: quarantine is reversible by a
    // human decision, retirement is not. Collapsing them would make a recall
    // permanent — and people who know that becomes permanent stop quarantining,
    // which is the opposite of what the feature is for.
    expect(isFinished("quarantined")).toBe(false);
    expect(isFrozen("quarantined")).toBe(true);
    expect(isFrozen("active")).toBe(false);
  });
});
