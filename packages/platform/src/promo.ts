/**
 * Promo codes (SPEC §7) — pure discount math, no I/O, no Date.now(). These are
 * WEBSITE-NATIVE: we validate and apply the discount in our own code and charge
 * the reduced amount ourselves; we never create Stripe coupon/promo objects.
 *
 * A code can be percentage OR fixed, and can be exclusive to a specific package
 * and/or a specific client. Both rails share this: a platform-scoped code
 * discounts a tenant's credit-pack purchase; a tenant-scoped code discounts a
 * client's one-time package purchase. v1 applies to SINGLE-CHARGE purchases
 * (credit packs, one-time packages) — the fully website-native cases.
 */

export interface PromoCode {
  discountType: "percent" | "amount";
  percentOff?: number | null;
  amountOffCents?: number | null;
  /** When set, the code only applies to this package (tenant rail) or pack. */
  restrictedPackageId?: string | null;
  /** When set, only this client may use the code. */
  restrictedClientId?: string | null;
  maxRedemptions?: number | null;
  redemptionCount: number;
  expiresAt?: string | null;
  active: boolean;
}

export interface PromoContext {
  /** ISO instant from the caller (routes pass nowIso()). */
  nowIso: string;
  /** The package/pack being purchased (matched against restrictedPackageId). */
  targetId?: string | null;
  /** The client purchasing (matched against restrictedClientId). */
  clientId?: string | null;
}

export type PromoFailure = "not_found" | "inactive" | "expired" | "exhausted" | "wrong_package" | "wrong_client";
export type PromoResult =
  | { ok: true; discountCents: number; finalCents: number }
  | { ok: false; reason: PromoFailure };

/**
 * Validate `promo` against `ctx` and compute the discount on `amountCents`.
 * The discount is clamped to the amount (never negative, never below zero), so
 * a 100%-or-larger code yields `finalCents === 0` (a free grant).
 */
export function applyPromo(amountCents: number, promo: PromoCode | null | undefined, ctx: PromoContext): PromoResult {
  if (!promo) return { ok: false, reason: "not_found" };
  if (!promo.active) return { ok: false, reason: "inactive" };
  if (promo.expiresAt && promo.expiresAt < ctx.nowIso) return { ok: false, reason: "expired" };
  if (promo.maxRedemptions != null && promo.redemptionCount >= promo.maxRedemptions) return { ok: false, reason: "exhausted" };
  if (promo.restrictedPackageId && promo.restrictedPackageId !== ctx.targetId) return { ok: false, reason: "wrong_package" };
  if (promo.restrictedClientId && promo.restrictedClientId !== ctx.clientId) return { ok: false, reason: "wrong_client" };
  const amount = Math.max(0, Math.round(amountCents));
  const raw =
    promo.discountType === "percent"
      ? Math.round((amount * Math.min(100, Math.max(0, promo.percentOff ?? 0))) / 100)
      : Math.max(0, Math.round(promo.amountOffCents ?? 0));
  const discountCents = Math.min(amount, raw);
  return { ok: true, discountCents, finalCents: amount - discountCents };
}
