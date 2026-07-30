/**
 * PROMO CODES — pure discount math, no I/O, no `Date.now()`.
 *
 * WEBSITE-NATIVE by design: the discount is validated and applied in our own
 * code and the reduced amount is charged directly. No coupon or promotion object
 * is ever created at the payment provider. That keeps the rules here, where they
 * are testable, instead of split across two systems that must agree.
 *
 * A code can be percentage OR fixed, and can be exclusive to one PRODUCT and/or
 * one BUYER. Both rails share it: a platform-scoped code discounts a tenant's
 * purchase from us; a tenant-scoped code discounts a purchase from that tenant.
 * Applies to SINGLE-CHARGE purchases — the fully website-native case.
 *
 * `subjectId` was `clientId` before this package existed. The math never cared
 * what the buyer was; only the name did.
 */

export interface PromoCode {
  discountType: "percent" | "amount";
  percentOff?: number | null;
  amountOffCents?: number | null;
  /** When set, the code only applies to this package (tenant rail) or pack. */
  restrictedPackageId?: string | null;
  /** When set, only this buyer may use the code. */
  restrictedSubjectId?: string | null;
  maxRedemptions?: number | null;
  redemptionCount: number;
  expiresAt?: string | null;
  active: boolean;
}

export interface PromoContext {
  /** ISO instant from the caller (routes pass nowIso()). */
  nowIso: string;
  /** What is being purchased (matched against `restrictedPackageId`). */
  targetId?: string | null;
  /** Who is purchasing (matched against `restrictedSubjectId`). */
  subjectId?: string | null;
}

export type PromoFailure = "not_found" | "inactive" | "expired" | "exhausted" | "wrong_package" | "wrong_subject";
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
  if (promo.restrictedSubjectId && promo.restrictedSubjectId !== ctx.subjectId) return { ok: false, reason: "wrong_subject" };
  const amount = Math.max(0, Math.round(amountCents));
  const raw =
    promo.discountType === "percent"
      ? Math.round((amount * Math.min(100, Math.max(0, promo.percentOff ?? 0))) / 100)
      : Math.max(0, Math.round(promo.amountOffCents ?? 0));
  const discountCents = Math.min(amount, raw);
  return { ok: true, discountCents, finalCents: amount - discountCents };
}
