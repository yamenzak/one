/**
 * Promo application (billing centralization) — resolve a website-native promo
 * code from D1 and apply it to a single-charge purchase. Shared by both rails:
 *   - platform (Kova → tenant): scope='platform', tenant-agnostic (tenant_id '')
 *   - tenant   (tenant → client): scope='tenant', scoped to the tenant
 * The discount math is pure (`applyPromo` in @kova/domain); this layer only
 * loads the row and, on a successful charge, bumps the redemption counter.
 */

import { applyPromo, type PromoCode, type PromoResult } from "@kova/domain";

interface PromoRow {
  id: string;
  discount_type: string;
  percent_off: number | null;
  amount_off_cents: number | null;
  restricted_package_id: string | null;
  restricted_client_id: string | null;
  max_redemptions: number | null;
  redemption_count: number;
  expires_at: string | null;
  active: number;
}

const toDomain = (r: PromoRow): PromoCode => ({
  discountType: r.discount_type === "amount" ? "amount" : "percent",
  percentOff: r.percent_off,
  amountOffCents: r.amount_off_cents,
  restrictedPackageId: r.restricted_package_id,
  restrictedClientId: r.restricted_client_id,
  maxRedemptions: r.max_redemptions,
  redemptionCount: r.redemption_count,
  expiresAt: r.expires_at,
  active: r.active === 1,
});

/** Look up a code within a rail scope; returns the row id + validated discount,
 *  or a typed failure the route surfaces as a 400. `code` is matched uppercased. */
export async function resolveAndApplyPromo(
  db: D1Database,
  opts: { scope: "tenant" | "platform"; tenantId: string; code: string; amountCents: number; nowIso: string; targetId?: string | null; clientId?: string | null },
): Promise<({ id: string } & Extract<PromoResult, { ok: true }>) | Extract<PromoResult, { ok: false }>> {
  const row = await db
    .prepare("SELECT * FROM promo_codes WHERE tenant_id = ? AND code = ? AND scope = ?")
    .bind(opts.scope === "platform" ? "" : opts.tenantId, opts.code.toUpperCase(), opts.scope)
    .first<PromoRow>();
  const res = applyPromo(opts.amountCents, row ? toDomain(row) : null, { nowIso: opts.nowIso, targetId: opts.targetId, clientId: opts.clientId });
  if (!res.ok) return res;
  return { id: row!.id, ...res };
}

/** Atomically consume one redemption slot: the guarded UPDATE is the single
 *  serialization point, so under concurrency only `max_redemptions` callers ever
 *  see `changes > 0`. Returns whether a slot was consumed. Use this to GATE a
 *  value-producing action (the free-grant path) BEFORE granting, so two racing
 *  requests can't both grant against a one-use code. */
export async function consumePromoRedemption(db: D1Database, promoId: string): Promise<boolean> {
  const r = await db
    .prepare("UPDATE promo_codes SET redemption_count = redemption_count + 1 WHERE id = ? AND (max_redemptions IS NULL OR redemption_count < max_redemptions)")
    .bind(promoId)
    .run()
    .catch(() => ({ meta: { changes: 0 } }) as { meta?: { changes?: number } });
  return (r.meta?.changes ?? 0) > 0;
}

/** Compensate a slot consumed by `consumePromoRedemption` when the
 *  value-producing grant that followed it FAILS. Releases the slot (guarded so
 *  the count can never go negative) so the buyer can retry instead of being
 *  permanently rejected with `promo_exhausted` against a one-use code — the same
 *  compensation the redemption-code /redeem path uses. Best-effort. */
export async function releasePromoRedemption(db: D1Database, promoId: string): Promise<void> {
  await db
    .prepare("UPDATE promo_codes SET redemption_count = redemption_count - 1 WHERE id = ? AND redemption_count > 0")
    .bind(promoId)
    .run()
    .catch(() => undefined);
}

/** Fire-and-forget counter bump for the PAID path (called from a webhook AFTER
 *  the charge succeeded). Note: on the paid path the eligibility check runs at
 *  intent time and this bump lands at payment time, so under heavy concurrency a
 *  bounded code can back a few extra DISCOUNTED sales — bounded (each still pays
 *  the reduced price), by design for website-native promos. The free-grant path
 *  uses `consumePromoRedemption` instead precisely because it has no such
 *  payment gate. */
export async function bumpPromoRedemption(db: D1Database, promoId: string): Promise<void> {
  await consumePromoRedemption(db, promoId);
}
