import { describe, expect, it } from "vitest";
import { applyPromo, type PromoCode } from "../src/promo.js";

const base: PromoCode = { discountType: "percent", percentOff: 20, redemptionCount: 0, active: true };
const ctx = { nowIso: "2026-07-21T00:00:00.000Z" };

describe("applyPromo", () => {
  it("percentage discount rounds and never goes below zero", () => {
    const r = applyPromo(5000, { ...base, percentOff: 20 }, ctx);
    expect(r).toEqual({ ok: true, discountCents: 1000, finalCents: 4000 });
  });

  it("fixed discount is clamped to the amount (100%+ off → free grant)", () => {
    const r = applyPromo(3000, { ...base, discountType: "amount", amountOffCents: 5000 }, ctx);
    expect(r).toEqual({ ok: true, discountCents: 3000, finalCents: 0 });
  });

  it("a 100% code yields a free grant", () => {
    expect(applyPromo(9900, { ...base, percentOff: 100 }, ctx)).toEqual({ ok: true, discountCents: 9900, finalCents: 0 });
  });

  it("rejects inactive, expired, and exhausted codes", () => {
    expect(applyPromo(1000, { ...base, active: false }, ctx)).toEqual({ ok: false, reason: "inactive" });
    expect(applyPromo(1000, { ...base, expiresAt: "2026-07-20T00:00:00.000Z" }, ctx)).toEqual({ ok: false, reason: "expired" });
    expect(applyPromo(1000, { ...base, maxRedemptions: 3, redemptionCount: 3 }, ctx)).toEqual({ ok: false, reason: "exhausted" });
    expect(applyPromo(1000, null, ctx)).toEqual({ ok: false, reason: "not_found" });
  });

  it("enforces per-package and per-client exclusivity", () => {
    const scoped: PromoCode = { ...base, restrictedPackageId: "pkg_1", restrictedSubjectId: "cl_1" };
    expect(applyPromo(1000, scoped, { ...ctx, targetId: "pkg_2", subjectId: "cl_1" })).toEqual({ ok: false, reason: "wrong_package" });
    expect(applyPromo(1000, scoped, { ...ctx, targetId: "pkg_1", subjectId: "cl_2" })).toEqual({ ok: false, reason: "wrong_subject" });
    const r = applyPromo(1000, scoped, { ...ctx, targetId: "pkg_1", subjectId: "cl_1" });
    expect(r.ok).toBe(true);
  });

  it("an unrestricted code applies regardless of package/client", () => {
    const r = applyPromo(2000, base, { ...ctx, targetId: "anything", subjectId: "anyone" });
    expect(r).toEqual({ ok: true, discountCents: 400, finalCents: 1600 });
  });
});
