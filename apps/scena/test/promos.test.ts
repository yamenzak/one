import { describe, it, expect } from "vitest";
import { validateRedemption } from "../src/promos.js";
import type { PromoRow } from "../src/billing-store.js";

const promo = (over: Partial<PromoRow> = {}): PromoRow => ({
  code: "GIFT",
  kind: "plan",
  credits: null,
  plan_id: "pro",
  plan_months: 12,
  max_redemptions: null,
  redeemed_count: 0,
  per_tenant_limit: 1,
  expires_at: null,
  note: null,
  active: 1,
  created_at: 0,
  ...over,
});

const NOW = 1_700_000_000_000;

describe("promo redemption gate", () => {
  it("accepts a fresh valid code", () => {
    expect(validateRedemption(promo(), NOW, 0)).toEqual({ ok: true });
  });

  it("rejects a missing code", () => {
    expect(validateRedemption(null, NOW, 0)).toEqual({ ok: false, error: "not_found" });
  });

  it("rejects an inactive code", () => {
    expect(validateRedemption(promo({ active: 0 }), NOW, 0)).toEqual({ ok: false, error: "inactive" });
  });

  it("rejects an expired code", () => {
    expect(validateRedemption(promo({ expires_at: NOW - 1 }), NOW, 0)).toEqual({ ok: false, error: "expired" });
  });

  it("rejects once global max_redemptions is reached", () => {
    expect(validateRedemption(promo({ max_redemptions: 5, redeemed_count: 5 }), NOW, 0)).toEqual({ ok: false, error: "exhausted" });
  });

  it("enforces the per-tenant limit (default 1)", () => {
    expect(validateRedemption(promo(), NOW, 1)).toEqual({ ok: false, error: "already_redeemed" });
    // A code that allows 3 per tenant still accepts the 2nd redemption.
    expect(validateRedemption(promo({ per_tenant_limit: 3 }), NOW, 1)).toEqual({ ok: true });
  });
});
